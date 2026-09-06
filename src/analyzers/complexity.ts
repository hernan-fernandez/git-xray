// Complexity trend computation
// Samples repository snapshots at regular intervals (monthly or weekly)
// and computes totalFiles, totalSize, and churnRate for each snapshot.
//
// churnRate is the share of files that changed between consecutive snapshots,
// computed from `git diff-tree -r --name-only <prev> <curr>`. It is a real
// measurement, not a proxy from file-count differences.

import type { GitRunner } from '../git/runner.js';
import { revListSnapshot, lsTree, diffTreeNames } from '../git/commands.js';
import { pathInScope } from '../utils/path-scope.js';

export interface ComplexitySnapshot {
  date: Date;
  totalFiles: number;
  totalSize: number;
  churnRate: number;
  /**
   * Commit hash that the snapshot reflects. Optional so analyzer outputs
   * remain compatible with synthetic test fixtures that build snapshots
   * directly. When present, enables real churn computation between
   * consecutive snapshots.
   */
  commitHash?: string;
}

export interface ComplexityTrendData {
  snapshots: ComplexitySnapshot[];
  interval: 'weekly' | 'monthly';
}

export interface ComplexityConfig {
  from: Date;
  to: Date;
  branch: string;
  scope?: string;
}

const THREE_MONTHS_MS = 3 * 30 * 24 * 60 * 60 * 1000; // ~90 days

/**
 * Maximum number of complexity snapshots returned. Each snapshot triggers a
 * rev-list + ls-tree (and a diff-tree against the previous snapshot), so
 * unbounded sampling on long histories can dominate runtime. 24 keeps the
 * chart readable and bounds the worst case to ~72 git invocations.
 */
const MAX_SNAPSHOTS = 24;

/**
 * Determine whether to use monthly or weekly intervals.
 * Monthly if the date range spans >= 3 months, weekly otherwise.
 */
export function determineInterval(from: Date, to: Date): 'weekly' | 'monthly' {
  const rangeMs = to.getTime() - from.getTime();
  return rangeMs >= THREE_MONTHS_MS ? 'monthly' : 'weekly';
}

/**
 * Downsample a sorted array of dates to at most `max` entries by picking
 * evenly-spaced indices. Always preserves the first and last entries so the
 * trend chart shows the true endpoints. No-op when `dates.length <= max`.
 */
export function downsampleDates(dates: Date[], max: number): Date[] {
  if (dates.length <= max || max <= 1) return dates;
  // Map index 0..max-1 onto 0..dates.length-1 with rounding so the endpoints
  // are exactly the first and last input dates.
  const out: Date[] = [];
  for (let i = 0; i < max; i++) {
    const sourceIdx = Math.round((i * (dates.length - 1)) / (max - 1));
    out.push(dates[sourceIdx]);
  }
  return out;
}

/**
 * Generate snapshot sample dates between `from` and `to`.
 * Monthly: first day of each month within the range.
 * Weekly: every 7 days starting from `from`.
 */
export function generateSnapshotDates(from: Date, to: Date, interval: 'weekly' | 'monthly'): Date[] {
  const dates: Date[] = [];

  if (interval === 'monthly') {
    // Start at the first day of the month of `from`
    let current = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
    // If the first-of-month is before `from`, advance to next month
    if (current.getTime() < from.getTime()) {
      current = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1));
    }
    while (current.getTime() <= to.getTime()) {
      dates.push(new Date(current));
      current = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1));
    }
  } else {
    // Weekly: every 7 days from `from`
    let current = new Date(from);
    while (current.getTime() <= to.getTime()) {
      dates.push(new Date(current));
      current = new Date(current.getTime() + 7 * 24 * 60 * 60 * 1000);
    }
  }

  // Always include the `to` date as the last snapshot if it's not already there
  if (dates.length > 0 && dates[dates.length - 1].getTime() !== to.getTime()) {
    dates.push(new Date(to));
  } else if (dates.length === 0) {
    // If no dates were generated, at least include `to`
    dates.push(new Date(to));
  }

  return dates;
}


/**
 * Parse ls-tree output string into TreeEntry objects.
 * Used when we have the full output as a string from exec().
 */
export function parseLsTreeOutput(output: string, scope?: string): { totalFiles: number; totalSize: number } {
  let totalFiles = 0;
  let totalSize = 0;

  const lines = output.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Format: "mode type hash    size\tpath"
    const tabIndex = trimmed.indexOf('\t');
    if (tabIndex === -1) continue;

    const meta = trimmed.substring(0, tabIndex);
    const path = trimmed.substring(tabIndex + 1);

    const parts = meta.split(/\s+/);
    if (parts.length < 4) continue;

    const type = parts[1];
    const sizeStr = parts[3];

    if (type !== 'blob') continue;

    // Apply scope filter if provided (segment-boundary match, not raw prefix)
    if (scope && !pathInScope(path, scope)) continue;

    const size = sizeStr === '-' ? 0 : parseInt(sizeStr, 10);
    if (isNaN(size)) continue;

    totalFiles++;
    totalSize += size;
  }

  return { totalFiles, totalSize };
}

/**
 * Find the commit hash at a given snapshot date using git rev-list.
 * Returns null if no commit exists at that point.
 */
async function findCommitAtDate(
  date: Date,
  branch: string,
  gitRunner: GitRunner,
): Promise<string | null> {
  // Use a window: --after = date - 1 day, --before = date + 1 day
  // This gives us the most recent commit at or before the snapshot date
  const beforeDate = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  const args = revListSnapshot(new Date(0), beforeDate, branch);
  const output = await gitRunner.exec(args);
  const hash = output.trim();
  return hash || null;
}

/**
 * Get tree metrics (totalFiles, totalSize) for a given commit.
 */
async function getTreeMetrics(
  commitHash: string,
  gitRunner: GitRunner,
  scope?: string,
): Promise<{ totalFiles: number; totalSize: number }> {
  const args = lsTree(commitHash);
  const output = await gitRunner.exec(args);
  return parseLsTreeOutput(output, scope);
}

/**
 * Analyze complexity trends by sampling repository snapshots.
 *
 * @param config - Date range, branch, and optional scope
 * @param gitRunner - Git command runner
 * @returns ComplexityTrendData with snapshots and interval
 */
export async function analyzeComplexityTrend(
  config: ComplexityConfig,
  gitRunner: GitRunner,
): Promise<ComplexityTrendData> {
  const interval = determineInterval(config.from, config.to);
  const allDates = generateSnapshotDates(config.from, config.to, interval);
  // Cap the number of snapshots so very long histories stay responsive.
  // Endpoints are preserved so the chart still shows the full range.
  const snapshotDates = downsampleDates(allDates, MAX_SNAPSHOTS);

  const snapshots: ComplexitySnapshot[] = [];

  for (const date of snapshotDates) {
    const commitHash = await findCommitAtDate(date, config.branch, gitRunner);
    if (!commitHash) continue;

    const { totalFiles, totalSize } = await getTreeMetrics(commitHash, gitRunner, config.scope);

    snapshots.push({
      date,
      totalFiles,
      totalSize,
      churnRate: 0, // Computed below from inter-snapshot diffs
      commitHash,
    });
  }

  // Compute churnRate as the fraction of files that changed between
  // consecutive snapshots, using git diff-tree. First snapshot stays at 0.
  await computeChurnRates(snapshots, gitRunner);

  return { snapshots, interval };
}

/**
 * Compute churn rates between consecutive snapshots using `git diff-tree`.
 *
 * For each snapshot pair (prev, curr) with both commit hashes available:
 *     churnRate = filesChanged / max(curr.totalFiles, 1)
 *
 * filesChanged is the number of distinct paths returned by
 * `git diff-tree -r --name-only <prev> <curr>` — that is, every blob added,
 * deleted, modified, or renamed between the two commits.
 *
 * Snapshots without a commit hash (synthetic fixtures, or rev-list misses)
 * keep churnRate = 0. The first snapshot has no predecessor, so it also
 * stays at 0. Failures are non-fatal: if a diff-tree call fails, that
 * snapshot's churnRate is left at 0 and the rest continue.
 */
export async function computeChurnRates(
  snapshots: ComplexitySnapshot[],
  gitRunner?: GitRunner,
): Promise<void> {
  if (snapshots.length < 2) return;

  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];

    if (!gitRunner || !prev.commitHash || !curr.commitHash || prev.commitHash === curr.commitHash) {
      curr.churnRate = 0;
      continue;
    }

    try {
      const raw = await gitRunner.exec(diffTreeNames(prev.commitHash, curr.commitHash));
      const filesChanged = countChangedPaths(raw);
      const denominator = Math.max(curr.totalFiles, 1);
      curr.churnRate = filesChanged / denominator;
    } catch {
      // Best-effort: leave at 0 on diff-tree failure, do not abort the run
      curr.churnRate = 0;
    }
  }
}

/** Count distinct non-empty path lines in `git diff-tree --name-only` output. */
function countChangedPaths(output: string): number {
  const seen = new Set<string>();
  for (const line of output.split('\n')) {
    const path = line.trim();
    if (path) seen.add(path);
  }
  return seen.size;
}
