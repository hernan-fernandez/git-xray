// Analysis phase sequencing and progress
// Runs: contributions → hotspots → complexity → bus factor → PR velocity
// Graceful degradation: if a phase fails, skip it and continue with the rest.

import { Readable } from 'node:stream';
import { writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { basename, dirname } from 'node:path';

import type { GitXrayConfig } from './config.js';
import type { GitRunner } from './git/runner.js';
import { GitCommandRunner } from './git/runner.js';
import {
  contributionLog,
  contributionNumstat,
  hotspotLog,
  mergeLog,
  firstParentLog,
  type CommandFilters,
} from './git/commands.js';
import { LogParser, type CommitRecord } from './parsers/log-parser.js';
import { NumstatParser, type FileChangeRecord } from './parsers/numstat-parser.js';
import { MergeParser, type MergeRecord } from './parsers/merge-parser.js';
import { analyzeContributions, type ContributionData } from './analyzers/contributions.js';
import { analyzePersonal, type PersonalStats } from './analyzers/personal.js';
import {
  analyzeHotspots,
  type HotspotData,
  type NameStatusCommit,
} from './analyzers/hotspots.js';
import {
  analyzeComplexityTrend,
  type ComplexityTrendData,
  type ComplexityConfig,
} from './analyzers/complexity.js';
import { analyzeBusFactor, type BusFactorData } from './analyzers/bus-factor.js';
import { analyzePRVelocity, type PRVelocityData } from './analyzers/pr-velocity.js';
import { aggregateReport, truncateForHtml, truncateForTerminal } from './report/aggregator.js';
import { classifyPersonality } from './analyzers/personality.js';
import { generateSummary } from './analyzers/summary.js';
import { analyzeCollaboration } from './analyzers/collaboration.js';
import { renderHtmlReport } from './report/html-renderer.js';
import { renderTerminalReport } from './report/terminal-renderer.js';
import { writeJsonReport } from './report/json-writer.js';
import { startPhase, endPhase } from './utils/progress.js';

/**
 * Pipe a source stream through a parser and collect all parsed objects.
 *
 * Errors on the source (e.g. GitError from a non-zero git exit) are forwarded
 * to the parser so the async iteration rejects and the phase's try/catch can
 * degrade gracefully — `.pipe()` alone does NOT propagate source errors, and
 * an unhandled 'error' event would crash the process.
 */
async function parseStream<T>(source: Readable, parser: NodeJS.ReadWriteStream): Promise<T[]> {
  source.on('error', (err) => {
    (parser as unknown as Readable).destroy(err as Error);
  });
  const items: T[] = [];
  for await (const item of source.pipe(parser) as AsyncIterable<T>) {
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
export function parseNameStatusOutput(raw: string): NameStatusCommit[] {
  const commits: NameStatusCommit[] = [];
  let current: NameStatusCommit | null = null;

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
        let filePath = line.substring(tabIdx + 1).trim();
        // Rename/copy entries (R100, C75, ...) carry two tab-separated paths:
        // "R100\told/path\tnew/path". Attribute the change to the new path.
        if (/^[RC]\d*$/i.test(status)) {
          const lastTab = filePath.lastIndexOf('\t');
          if (lastTab !== -1) {
            filePath = filePath.substring(lastTab + 1).trim();
          }
        }
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
 * Build CommandFilters from GitXrayConfig.
 */
function buildFilters(config: GitXrayConfig): CommandFilters {
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
function emptyContributions(): ContributionData {
  return { authors: [], heatmap: Array.from({ length: 7 }, () => Array(24).fill(0)), totalCommits: 0, totalAuthors: 0 };
}

function emptyHotspots(): HotspotData {
  return { hotspots: [], totalFileCount: 0 };
}

function emptyComplexity(): ComplexityTrendData {
  return { snapshots: [], interval: 'monthly' };
}

function emptyBusFactor(): BusFactorData {
  return {
    overall: { scope: 'overall', busFactor: 0, topAuthors: [] },
    perDirectory: new Map(),
    singlePointRisks: [],
  };
}

function emptyPRVelocity(): PRVelocityData {
  return { available: false, averageMergeTime: null, mergesPerMonth: [], totalMerges: 0 };
}

/**
 * Open a file in the default browser (platform-specific).
 */
function openInBrowser(filePath: string): void {
  // Array-form spawn (no shell) so the file path is passed as a literal
  // argument — a path containing quotes or $(...) cannot inject commands.
  const platform = process.platform;
  let cmd: string;
  let args: string[];
  if (platform === 'darwin') {
    cmd = 'open';
    args = [filePath];
  } else if (platform === 'win32') {
    // `start` is a cmd.exe builtin; the empty string is the window title
    cmd = 'cmd';
    args = ['/c', 'start', '', filePath];
  } else {
    cmd = 'xdg-open';
    args = [filePath];
  }
  const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
  child.on('error', () => {
    // Ignore errors — best effort
  });
  child.unref();
}

/**
 * Run the full analysis pipeline.
 *
 * Phases run sequentially: contributions → hotspots → complexity → bus factor → PR velocity.
 * Each phase is wrapped in try/catch for graceful degradation.
 * After all phases, results are aggregated and rendered.
 *
 * @returns Process exit code: 0 on success (including partial degradation),
 *          1 when every git-backed phase failed and no data was collected.
 */
export async function runAnalysis(config: GitXrayConfig): Promise<number> {
  const gitRunner: GitRunner = new GitCommandRunner(config.repoPath);
  // Git-backed phases that failed (bus factor is pure computation, excluded)
  const failedPhases: string[] = [];
  const filters = buildFilters(config);
  const repoName = config.repoDisplayName || basename(config.repoPath);

  // Resolve output path: if not specified, generate a unique default
  if (!config.output) {
    const date = new Date().toISOString().slice(0, 10);
    const safeName = repoName.replace(/[^a-zA-Z0-9_-]/g, '-');
    config.output = `./${safeName}-${date}.html`;
  }

  let commits: CommitRecord[] = [];
  let fileChanges: FileChangeRecord[] = [];
  let contributions: ContributionData = emptyContributions();
  let hotspots: HotspotData = emptyHotspots();
  let complexity: ComplexityTrendData = emptyComplexity();
  let busFactor: BusFactorData = emptyBusFactor();
  let prVelocity: PRVelocityData = emptyPRVelocity();
  let personalStats: PersonalStats | undefined;

  // Resolve --me flag to actual git user name
  if (config.author === '__ME__') {
    try {
      const name = await gitRunner.exec(['config', 'user.name']);
      config.author = name.trim();
      if (!config.author) {
        console.warn('Warning: Could not detect git user.name. Use --author "Your Name" instead.');
        config.author = undefined;
      }
    } catch {
      console.warn('Warning: Could not detect git user.name. Use --author "Your Name" instead.');
      config.author = undefined;
    }
  }

  // Phases 1 and 2 share no input — kick off the hotspot raw-fetch in parallel
  // with the contribution streams, then post-process once both finish. The
  // `commitAuthors` map (built from contribution-phase commits) is the only
  // data dependency between them, and it is applied after both raw fetches
  // complete. Progress UI is owned by phase 2's startPhase/endPhase below;
  // we don't surface a separate progress line for the background fetch.
  let hotspotRawError: Error | undefined;
  const hotspotRawPromise = gitRunner.exec(hotspotLog(filters)).catch((err) => {
    hotspotRawError = err as Error;
    return '';
  });

  // Phase 1: Contributions
  try {
    startPhase('Analyzing contributions...');
    const logStream = gitRunner.stream(contributionLog(filters));
    commits = await parseStream<CommitRecord>(logStream, new LogParser());

    const numstatStream = gitRunner.stream(contributionNumstat(filters));
    fileChanges = await parseStream<FileChangeRecord>(numstatStream, new NumstatParser());

    contributions = analyzeContributions(commits, fileChanges);
    endPhase();
  } catch (err) {
    endPhase();
    failedPhases.push('contributions');
    console.warn('Warning: Contribution analysis failed, skipping.', (err as Error).message);
  }

  // Personal mode analysis (after contributions phase has commits + fileChanges)
  if (config.author && commits.length > 0) {
    personalStats = analyzePersonal(config.author, commits, fileChanges);
    if (personalStats.totalCommits === 0) {
      console.warn(`Warning: No commits found for author "${config.author}". Showing full repo report.`);
      personalStats = undefined;
    }
  }

  // Phase 2: Hotspots (raw fetch was kicked off above; finish post-processing now)
  try {
    startPhase('Detecting code hotspots...');
    const hotspotRaw = await hotspotRawPromise;
    if (hotspotRawError) throw hotspotRawError;

    const nameStatusCommits = parseNameStatusOutput(hotspotRaw);

    // Build commitHash → author map from contribution-phase commits so the
    // hotspot pass can populate uniqueAuthors without a second git call.
    const commitAuthors = new Map<string, string>();
    for (const c of commits) commitAuthors.set(c.hash, c.author);

    hotspots = await analyzeHotspots(
      nameStatusCommits,
      { followRenames: config.followRenames, totalCommits: commits.length, commitAuthors },
      gitRunner,
      filters,
    );

    // Surface the large-repo warning for --follow-renames (Requirement 3.5)
    if (hotspots.warning) {
      process.stderr.write(`Warning: ${hotspots.warning}\n`);
    }

    endPhase();
  } catch (err) {
    endPhase();
    failedPhases.push('hotspots');
    console.warn('Warning: Hotspot analysis failed, skipping.', (err as Error).message);
  }

  // Phase 3: Complexity
  try {
    startPhase('Computing complexity trends...');
    // Determine date range from commits or config
    let fromDate: Date;
    let toDate: Date;

    if (config.since) {
      fromDate = config.since;
    } else if (commits.length > 0) {
      // Find the earliest commit date
      fromDate = commits.reduce(
        (min, c) => (c.date.getTime() < min.getTime() ? c.date : min),
        commits[0].date,
      );
    } else {
      fromDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); // 1 year ago fallback
    }

    if (config.until) {
      toDate = config.until;
    } else if (commits.length > 0) {
      toDate = commits.reduce(
        (max, c) => (c.date.getTime() > max.getTime() ? c.date : max),
        commits[0].date,
      );
    } else {
      toDate = new Date();
    }

    const complexityConfig: ComplexityConfig = {
      from: fromDate,
      to: toDate,
      branch: config.branch ?? 'HEAD',
      scope: config.scope,
    };

    complexity = await analyzeComplexityTrend(complexityConfig, gitRunner);
    endPhase();
  } catch (err) {
    endPhase();
    failedPhases.push('complexity');
    console.warn('Warning: Complexity analysis failed, skipping.', (err as Error).message);
  }

  // Phase 4: Bus Factor
  try {
    startPhase('Calculating bus factor...');
    const referenceDate = config.until ?? new Date();
    busFactor = analyzeBusFactor(commits, fileChanges, referenceDate, config.scope);
    endPhase();
  } catch (err) {
    endPhase();
    console.warn('Warning: Bus factor analysis failed, skipping.', (err as Error).message);
  }

  // Phase 5: PR Velocity
  try {
    startPhase('Measuring PR velocity...');
    const mergeStream = gitRunner.stream(mergeLog(filters));
    const mergeRecords = await parseStream<MergeRecord>(mergeStream, new MergeParser());

    const firstParentRaw = await gitRunner.exec(firstParentLog(filters));
    const mainLineHashes = new Set<string>(
      firstParentRaw
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0),
    );

    prVelocity = analyzePRVelocity(mergeRecords, commits, mainLineHashes);
    endPhase();
  } catch (err) {
    endPhase();
    failedPhases.push('PR velocity');
    console.warn('Warning: PR velocity analysis failed, skipping.', (err as Error).message);
  }

  // If every git-backed phase failed, there is no data to report. Fail loudly
  // instead of writing an empty report and exiting 0, so CI can detect it.
  const GIT_PHASE_COUNT = 4; // contributions, hotspots, complexity, PR velocity
  if (failedPhases.length >= GIT_PHASE_COUNT) {
    process.stderr.write(
      'Error: all analysis phases failed — no git data could be collected.\n' +
        'Check that the branch exists and the repository has commits.\n',
    );
    return 1;
  }

  // Determine date range for the report
  let reportFrom: Date;
  let reportTo: Date;

  if (config.since) {
    reportFrom = config.since;
  } else if (commits.length > 0) {
    reportFrom = commits.reduce(
      (min, c) => (c.date.getTime() < min.getTime() ? c.date : min),
      commits[0].date,
    );
  } else {
    reportFrom = new Date();
  }

  if (config.until) {
    reportTo = config.until;
  } else if (commits.length > 0) {
    reportTo = commits.reduce(
      (max, c) => (c.date.getTime() > max.getTime() ? c.date : max),
      commits[0].date,
    );
  } else {
    reportTo = new Date();
  }

  // Collaboration graph
  const collaboration = analyzeCollaboration(fileChanges);

  // Classify repo personality
  const personality = classifyPersonality({
    contributions,
    busFactor,
    prVelocity,
    hotspots,
    complexity,
  });

  // Generate summary
  const summary = generateSummary({
    repoName,
    contributions,
    busFactor,
    prVelocity,
    hotspots,
    personality,
  });

  // Aggregate
  const reportData = aggregateReport({
    repoName,
    branch: config.branch ?? 'HEAD',
    dateRange: { from: reportFrom, to: reportTo },
    contributions,
    hotspots,
    complexity,
    busFactor,
    prVelocity,
    personal: personalStats,
    personality,
    collaboration,
    summary,
  });

  // Render HTML report (truncated for HTML)
  const htmlData = truncateForHtml(reportData);
  const html = await renderHtmlReport(htmlData);
  // Ensure the output directory exists (e.g. --output reports/out.html)
  await mkdir(dirname(config.output), { recursive: true });
  await writeFile(config.output, html, 'utf-8');

  // Render terminal report (unless --quiet was passed), truncated to the
  // terminal limits (20 hotspots / 10 contributors)
  if (!config.quiet) {
    const terminalOutput = renderTerminalReport(truncateForTerminal(reportData), config.noColor);
    process.stdout.write(terminalOutput);
  }

  // Optionally write JSON. Strip a .html/.htm suffix case-insensitively and
  // append .json, so an output path without a .html suffix can never cause
  // the JSON to overwrite the HTML report just written.
  if (config.json) {
    const jsonPath = config.output.replace(/\.html?$/i, '') + '.json';
    await writeJsonReport(reportData, jsonPath);
  }

  // Optionally open in browser
  if (!config.noOpen) {
    openInBrowser(config.output);
  }

  return 0;
}
