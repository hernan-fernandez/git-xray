// Analysis phase sequencing and progress
// Runs: contributions → hotspots → complexity → bus factor → PR velocity
// Graceful degradation: if a phase fails, skip it and continue with the rest.
import { writeFile } from 'node:fs/promises';
import { exec } from 'node:child_process';
import { basename } from 'node:path';
import { GitCommandRunner } from './git/runner.js';
import { contributionLog, contributionNumstat, hotspotLog, mergeLog, firstParentLog, } from './git/commands.js';
import { LogParser } from './parsers/log-parser.js';
import { NumstatParser } from './parsers/numstat-parser.js';
import { MergeParser } from './parsers/merge-parser.js';
import { analyzeContributions } from './analyzers/contributions.js';
import { analyzeHotspots, } from './analyzers/hotspots.js';
import { analyzeComplexityTrend, } from './analyzers/complexity.js';
import { analyzeBusFactor } from './analyzers/bus-factor.js';
import { analyzePRVelocity } from './analyzers/pr-velocity.js';
import { aggregateReport, truncateForHtml } from './report/aggregator.js';
import { renderHtmlReport } from './report/html-renderer.js';
import { renderTerminalReport } from './report/terminal-renderer.js';
import { writeJsonReport } from './report/json-writer.js';
import { startPhase, endPhase } from './utils/progress.js';
/**
 * Collect all objects from a readable object-mode stream into an array.
 */
async function collectStream(stream) {
    const items = [];
    for await (const item of stream) {
        items.push(item);
    }
    return items;
}
/**
 * Parse raw name-status git log output into NameStatusCommit[].
 * Format:
 *   <hash>
 *   <status>\t<filepath>
 *   ...
 *   (blank line)
 *   <hash>
 *   ...
 */
export function parseNameStatusOutput(raw) {
    const commits = [];
    let current = null;
    const lines = raw.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
            // Blank line — only finalize if the current commit has files.
            // git log --name-status --format="%H" produces a blank line
            // between the hash and the file entries, so we skip blank lines
            // when the current commit has no files yet.
            if (current && current.files.length > 0) {
                commits.push(current);
                current = null;
            }
            continue;
        }
        // Check if this is a commit hash (40 hex chars)
        if (/^[0-9a-f]{40}$/.test(trimmed)) {
            // If we had a previous commit in progress, push it
            if (current) {
                commits.push(current);
            }
            current = { commitHash: trimmed, files: [] };
            continue;
        }
        // Otherwise it's a file entry: "STATUS\tfilepath"
        if (current) {
            const tabIdx = line.indexOf('\t');
            if (tabIdx !== -1) {
                const status = line.substring(0, tabIdx).trim();
                const filePath = line.substring(tabIdx + 1).trim();
                if (status && filePath) {
                    current.files.push({ status, filePath });
                }
            }
        }
    }
    // Push the last commit if not yet pushed
    if (current) {
        commits.push(current);
    }
    return commits;
}
/**
 * Build CommandFilters from GitPeekConfig.
 */
function buildFilters(config) {
    return {
        since: config.since,
        until: config.until,
        branch: config.branch,
        scope: config.scope,
    };
}
/**
 * Default empty data for each analysis section (used when a phase fails).
 */
function emptyContributions() {
    return { authors: [], heatmap: Array.from({ length: 7 }, () => Array(24).fill(0)), totalCommits: 0 };
}
function emptyHotspots() {
    return { hotspots: [] };
}
function emptyComplexity() {
    return { snapshots: [], interval: 'monthly' };
}
function emptyBusFactor() {
    return {
        overall: { scope: 'overall', busFactor: 0, topAuthors: [] },
        perDirectory: new Map(),
        singlePointRisks: [],
    };
}
function emptyPRVelocity() {
    return { available: false, averageMergeTime: null, mergesPerMonth: [], totalMerges: 0 };
}
/**
 * Open a file in the default browser (platform-specific).
 */
function openInBrowser(filePath) {
    const platform = process.platform;
    let cmd;
    if (platform === 'darwin') {
        cmd = `open "${filePath}"`;
    }
    else if (platform === 'win32') {
        cmd = `start "" "${filePath}"`;
    }
    else {
        cmd = `xdg-open "${filePath}"`;
    }
    exec(cmd, () => {
        // Ignore errors — best effort
    });
}
/**
 * Run the full analysis pipeline.
 *
 * Phases run sequentially: contributions → hotspots → complexity → bus factor → PR velocity.
 * Each phase is wrapped in try/catch for graceful degradation.
 * After all phases, results are aggregated and rendered.
 */
export async function runAnalysis(config) {
    const gitRunner = new GitCommandRunner(config.repoPath);
    const filters = buildFilters(config);
    const repoName = basename(config.repoPath);
    // Resolve output path: if not specified, generate a unique default
    if (!config.output) {
        const date = new Date().toISOString().slice(0, 10);
        const safeName = repoName.replace(/[^a-zA-Z0-9_-]/g, '-');
        config.output = `./${safeName}-${date}.html`;
    }
    let commits = [];
    let fileChanges = [];
    let contributions = emptyContributions();
    let hotspots = emptyHotspots();
    let complexity = emptyComplexity();
    let busFactor = emptyBusFactor();
    let prVelocity = emptyPRVelocity();
    // Phase 1: Contributions
    try {
        startPhase('Analyzing contributions...');
        const logStream = gitRunner.stream(contributionLog(filters));
        commits = await collectStream(logStream.pipe(new LogParser()));
        const numstatStream = gitRunner.stream(contributionNumstat(filters));
        fileChanges = await collectStream(numstatStream.pipe(new NumstatParser()));
        contributions = analyzeContributions(commits, fileChanges);
        endPhase();
    }
    catch (err) {
        endPhase();
        console.warn('Warning: Contribution analysis failed, skipping.', err.message);
    }
    // Phase 2: Hotspots
    try {
        startPhase('Detecting code hotspots...');
        const hotspotRaw = await gitRunner.exec(hotspotLog(filters));
        const nameStatusCommits = parseNameStatusOutput(hotspotRaw);
        hotspots = await analyzeHotspots(nameStatusCommits, { followRenames: config.followRenames, totalCommits: commits.length }, gitRunner, filters);
        // Surface the large-repo warning for --follow-renames (Requirement 3.5)
        if (hotspots.warning) {
            process.stderr.write(`Warning: ${hotspots.warning}\n`);
        }
        endPhase();
    }
    catch (err) {
        endPhase();
        console.warn('Warning: Hotspot analysis failed, skipping.', err.message);
    }
    // Phase 3: Complexity
    try {
        startPhase('Computing complexity trends...');
        // Determine date range from commits or config
        let fromDate;
        let toDate;
        if (config.since) {
            fromDate = config.since;
        }
        else if (commits.length > 0) {
            // Find the earliest commit date
            fromDate = commits.reduce((min, c) => (c.date.getTime() < min.getTime() ? c.date : min), commits[0].date);
        }
        else {
            fromDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); // 1 year ago fallback
        }
        if (config.until) {
            toDate = config.until;
        }
        else if (commits.length > 0) {
            toDate = commits.reduce((max, c) => (c.date.getTime() > max.getTime() ? c.date : max), commits[0].date);
        }
        else {
            toDate = new Date();
        }
        const complexityConfig = {
            from: fromDate,
            to: toDate,
            branch: config.branch ?? 'HEAD',
            scope: config.scope,
        };
        complexity = await analyzeComplexityTrend(complexityConfig, gitRunner);
        endPhase();
    }
    catch (err) {
        endPhase();
        console.warn('Warning: Complexity analysis failed, skipping.', err.message);
    }
    // Phase 4: Bus Factor
    try {
        startPhase('Calculating bus factor...');
        const referenceDate = config.until ?? new Date();
        busFactor = analyzeBusFactor(commits, fileChanges, referenceDate);
        endPhase();
    }
    catch (err) {
        endPhase();
        console.warn('Warning: Bus factor analysis failed, skipping.', err.message);
    }
    // Phase 5: PR Velocity
    try {
        startPhase('Measuring PR velocity...');
        const mergeStream = gitRunner.stream(mergeLog(filters));
        const mergeRecords = await collectStream(mergeStream.pipe(new MergeParser()));
        const firstParentRaw = await gitRunner.exec(firstParentLog(filters));
        const mainLineHashes = new Set(firstParentRaw
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l.length > 0));
        prVelocity = analyzePRVelocity(mergeRecords, commits, mainLineHashes);
        endPhase();
    }
    catch (err) {
        endPhase();
        console.warn('Warning: PR velocity analysis failed, skipping.', err.message);
    }
    // Determine date range for the report
    let reportFrom;
    let reportTo;
    if (config.since) {
        reportFrom = config.since;
    }
    else if (commits.length > 0) {
        reportFrom = commits.reduce((min, c) => (c.date.getTime() < min.getTime() ? c.date : min), commits[0].date);
    }
    else {
        reportFrom = new Date();
    }
    if (config.until) {
        reportTo = config.until;
    }
    else if (commits.length > 0) {
        reportTo = commits.reduce((max, c) => (c.date.getTime() > max.getTime() ? c.date : max), commits[0].date);
    }
    else {
        reportTo = new Date();
    }
    // Aggregate
    const reportData = aggregateReport({
        repoName: basename(config.repoPath),
        branch: config.branch ?? 'HEAD',
        dateRange: { from: reportFrom, to: reportTo },
        contributions,
        hotspots,
        complexity,
        busFactor,
        prVelocity,
    });
    // Render HTML report (truncated for HTML)
    const htmlData = truncateForHtml(reportData);
    const html = await renderHtmlReport(htmlData);
    await writeFile(config.output, html, 'utf-8');
    // Render terminal report
    const terminalOutput = renderTerminalReport(reportData, config.noColor);
    process.stdout.write(terminalOutput);
    // Optionally write JSON
    if (config.json) {
        const jsonPath = config.output.replace(/\.html$/, '.json');
        await writeJsonReport(reportData, jsonPath);
    }
    // Optionally open in browser
    if (!config.noOpen) {
        openInBrowser(config.output);
    }
}
//# sourceMappingURL=orchestrator.js.map