// Git command builders (log, shortlog, ls-tree, etc.)
// Each builder returns a string[] of args to pass to GitRunner.

export interface CommandFilters {
  since?: Date;
  until?: Date;
  branch?: string;
  scope?: string;
}

function formatDate(date: Date): string {
  return date.toISOString();
}

function applyFilters(args: string[], filters: CommandFilters): string[] {
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

function applyScopeFilter(args: string[], scope?: string): string[] {
  if (scope) {
    args.push('--', scope);
  }
  return args;
}

/**
 * Contributions: git log --format="%H|%aN|%aE|%aI|%s|%P"
 * Pipe-delimited commit records (mailmap-resolved)
 */
export function contributionLog(filters: CommandFilters): string[] {
  const args = ['log', '--format=%H|%aN|%aE|%aI|%s|%P'];
  applyFilters(args, filters);
  return applyScopeFilter(args, filters.scope);
}

/**
 * Contributions (stats): git log --numstat --format="%H|%aN|%aI"
 * Numstat with commit headers (mailmap-resolved)
 */
export function contributionNumstat(filters: CommandFilters): string[] {
  const args = ['log', '--numstat', '--format=%H|%aN|%aI'];
  applyFilters(args, filters);
  return applyScopeFilter(args, filters.scope);
}

/**
 * Hotspots: git log --name-status --format="%H"
 * Commit hash + changed file paths (single pass for all files)
 */
export function hotspotLog(filters: CommandFilters): string[] {
  const args = ['log', '--name-status', '--format=%H'];
  applyFilters(args, filters);
  return applyScopeFilter(args, filters.scope);
}

/**
 * Hotspots (renames): git log --follow --name-only -- <file>
 * Per-file follow for top-20 hotspots only
 */
export function hotspotFollowLog(filePath: string, filters: CommandFilters): string[] {
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
export function lsTree(treeIsh: string): string[] {
  return ['ls-tree', '-r', '-l', treeIsh];
}

/**
 * Complexity (snapshots): git rev-list --after=<date> --before=<date> -1 <branch>
 * Commit hash at snapshot point
 */
export function revListSnapshot(afterDate: Date, beforeDate: Date, branch: string): string[] {
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
export function mergeLog(filters: CommandFilters): string[] {
  const args = ['log', '--merges', '--format=%H|%aI|%P|%s'];
  applyFilters(args, filters);
  return applyScopeFilter(args, filters.scope);
}

/**
 * PR Velocity (main-line): git log --first-parent --format="%H"
 * Main-line commit hashes
 */
export function firstParentLog(filters: CommandFilters): string[] {
  const args = ['log', '--first-parent', '--format=%H'];
  applyFilters(args, filters);
  return args;
}
