// Code hotspot detection
// Two-phase approach:
//   Phase 1: Parse name-status records to compute change frequencies (single pass)
//   Phase 2: When followRenames=true, run git log --follow for top-20 files in parallel
import { hotspotFollowLog } from '../git/commands.js';
import pLimit from 'p-limit';
const TOP_N = 20;
const LARGE_REPO_THRESHOLD = 5000;
const FOLLOW_CONCURRENCY = 5;
/**
 * Phase 1: Compute change frequencies from name-status commit records.
 * Counts distinct commits per file path.
 */
export function computeChangeFrequencies(commits) {
    const fileMap = new Map();
    for (const commit of commits) {
        // Track which files appear in this commit (deduplicate within a single commit)
        const seenInCommit = new Set();
        for (const file of commit.files) {
            if (!file.filePath || seenInCommit.has(file.filePath))
                continue;
            seenInCommit.add(file.filePath);
            let entry = fileMap.get(file.filePath);
            if (!entry) {
                entry = { changeCount: 0, authors: new Set() };
                fileMap.set(file.filePath, entry);
            }
            entry.changeCount++;
        }
    }
    return fileMap;
}
/**
 * Phase 2: For each file, run `git log --follow --name-only` and count
 * the number of commits returned (rename-aware count).
 */
async function getFollowCount(filePath, gitRunner, filters) {
    const args = hotspotFollowLog(filePath, filters);
    const output = await gitRunner.exec(args);
    // Each commit produces a hash line; count non-empty lines that look like hashes (40 hex chars)
    const lines = output.split('\n').filter((l) => l.trim().length > 0);
    // The format is %H, so each commit hash is on its own line, followed by file name lines
    // Count only the hash lines (40 hex chars)
    const commitHashes = new Set();
    for (const line of lines) {
        const trimmed = line.trim();
        if (/^[0-9a-f]{40}$/.test(trimmed)) {
            commitHashes.add(trimmed);
        }
    }
    return commitHashes.size;
}
/**
 * Analyze code hotspots from name-status commit data.
 *
 * @param commits - Structured name-status commit records
 * @param config - Whether to follow renames and total commit count
 * @param gitRunner - Git runner for phase 2 follow commands (optional, required if followRenames)
 * @param filters - Command filters for phase 2 follow commands
 */
export async function analyzeHotspots(commits, config, gitRunner, filters) {
    // Phase 1: compute change frequencies
    const fileMap = computeChangeFrequencies(commits);
    // Build initial hotspot list sorted by change count descending
    let hotspots = Array.from(fileMap.entries())
        .map(([filePath, data]) => ({
        filePath,
        changeCount: data.changeCount,
        uniqueAuthors: data.authors.size,
    }))
        .sort((a, b) => b.changeCount - a.changeCount);
    // Take top-20 for phase 2 consideration
    const top20 = hotspots.slice(0, TOP_N);
    let warning;
    // Phase 2: follow renames for top-20 files
    if (config.followRenames && gitRunner && filters) {
        if (config.totalCommits > LARGE_REPO_THRESHOLD) {
            warning = `Rename tracking may be slow on large repositories (${config.totalCommits} commits)`;
        }
        const limit = pLimit(FOLLOW_CONCURRENCY);
        const followResults = await Promise.all(top20.map((hotspot) => limit(async () => {
            const followCount = await getFollowCount(hotspot.filePath, gitRunner, filters);
            return { filePath: hotspot.filePath, followCount };
        })));
        // Replace phase 1 counts with follow-based counts for top-20 files
        const followMap = new Map(followResults.map((r) => [r.filePath, r.followCount]));
        for (const hotspot of hotspots) {
            const followCount = followMap.get(hotspot.filePath);
            if (followCount !== undefined) {
                hotspot.changeCount = followCount;
            }
        }
        // Re-sort after updating counts
        hotspots.sort((a, b) => b.changeCount - a.changeCount);
    }
    const result = { hotspots };
    if (warning) {
        result.warning = warning;
    }
    return result;
}
//# sourceMappingURL=hotspots.js.map