// Git command builders (log, shortlog, ls-tree, etc.)
// Each builder returns a string[] of args to pass to GitRunner.
function formatDate(date) {
    return date.toISOString();
}
function applyFilters(args, filters) {
    if (filters.since) {
        args.push(`--since=${formatDate(filters.since)}`);
    }
    if (filters.until) {
        args.push(`--until=${formatDate(filters.until)}`);
    }
    if (filters.branch) {
        args.push(filters.branch);
    }
    return args;
}
function applyScopeFilter(args, scope) {
    if (scope) {
        args.push('--', scope);
    }
    return args;
}
/**
 * Contributions: git log --format="%H|%aN|%aE|%aI|%s|%P"
 * Pipe-delimited commit records (mailmap-resolved)
 */
export function contributionLog(filters) {
    const args = ['log', '--format=%H|%aN|%aE|%aI|%s|%P'];
    applyFilters(args, filters);
    return applyScopeFilter(args, filters.scope);
}
/**
 * Contributions (stats): git log --numstat --format="%H|%aN|%aI"
 * Numstat with commit headers (mailmap-resolved)
 */
export function contributionNumstat(filters) {
    const args = ['log', '--numstat', '--format=%H|%aN|%aI'];
    applyFilters(args, filters);
    return applyScopeFilter(args, filters.scope);
}
/**
 * Hotspots: git log --name-status --format="%H"
 * Commit hash + changed file paths (single pass for all files)
 */
export function hotspotLog(filters) {
    const args = ['log', '--name-status', '--format=%H'];
    applyFilters(args, filters);
    return applyScopeFilter(args, filters.scope);
}
/**
 * Hotspots (renames): git log --follow --name-only -- <file>
 * Per-file follow for top-20 hotspots only
 */
export function hotspotFollowLog(filePath, filters) {
    const args = ['log', '--follow', '--name-only', '--format=%H'];
    if (filters.since) {
        args.push(`--since=${formatDate(filters.since)}`);
    }
    if (filters.until) {
        args.push(`--until=${formatDate(filters.until)}`);
    }
    if (filters.branch) {
        args.push(filters.branch);
    }
    args.push('--', filePath);
    return args;
}
/**
 * Complexity: git ls-tree -r -l <tree-ish>
 * Tree entries with file sizes
 */
export function lsTree(treeIsh) {
    return ['ls-tree', '-r', '-l', treeIsh];
}
/**
 * Complexity (snapshots): git rev-list --after=<date> --before=<date> -1 <branch>
 * Commit hash at snapshot point
 */
export function revListSnapshot(afterDate, beforeDate, branch) {
    return [
        'rev-list',
        `--after=${formatDate(afterDate)}`,
        `--before=${formatDate(beforeDate)}`,
        '-1',
        branch,
    ];
}
/**
 * PR Velocity: git log --merges --format="%H|%aI|%P|%s"
 * Merge commit records
 */
export function mergeLog(filters) {
    const args = ['log', '--merges', '--format=%H|%aI|%P|%s'];
    applyFilters(args, filters);
    return applyScopeFilter(args, filters.scope);
}
/**
 * PR Velocity (main-line): git log --first-parent --format="%H"
 * Main-line commit hashes
 */
export function firstParentLog(filters) {
    const args = ['log', '--first-parent', '--format=%H'];
    applyFilters(args, filters);
    return args;
}
//# sourceMappingURL=commands.js.map