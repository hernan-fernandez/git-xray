// Complexity trend computation
// Samples repository snapshots at regular intervals (monthly or weekly)
// and computes totalFiles, totalSize, and churnRate for each snapshot.

import type { GitRunner } from '../git/runner.js';
import type { TreeEntry } from '../parsers/ls-tree-parser.js';
import { revListSnapshot, lsTree } from '../git/commands.js';
import { LsTreeParser } from '../parsers/ls-tree-parser.js';

export interface ComplexitySnapshot {
  date: Date;
  totalFiles: number;
  totalSize: number;
  churnRate: number;
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
 * Determine whether to use monthly or weekly intervals.
 * Monthly if the date range spans >= 3 months, weekly otherwise.
 */
export function determineInterval(from: Date, to: Date): 'weekly' | 'monthly' {
  const rangeMs = to.getTime() - from.getTime();
  return rangeMs >= THREE_MONTHS_MS ? 'monthly' : 'weekly';
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

    // Apply scope filter if provided
    if (scope && !path.startsWith(scope)) continue;

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
  const snapshotDates = generateSnapshotDates(config.from, config.to, interval);

  const snapshots: ComplexitySnapshot[] = [];

  for (const date of snapshotDates) {
    const commitHash = await findCommitAtDate(date, config.branch, gitRunner);
    if (!commitHash) continue;

    const { totalFiles, totalSize } = await getTreeMetrics(commitHash, gitRunner, config.scope);

    snapshots.push({
      date,
      totalFiles,
      totalSize,
      churnRate: 0, // Will be computed after all snapshots are collected
    });
  }

  // Compute churnRate between consecutive snapshots
  // churnRate = |files changed| / totalFiles
  // We approximate "files changed" as the absolute difference in totalFiles between snapshots
  // A more accurate approach: compare file sets, but we use the size/count delta as proxy
  computeChurnRates(snapshots);

  return { snapshots, interval };
}

/**
 * Compute churn rates between consecutive snapshots.
 * churnRate for snapshot[i] = |totalFiles[i] - totalFiles[i-1]| / totalFiles[i]
 * First snapshot has churnRate = 0.
 */
export function computeChurnRates(snapshots: ComplexitySnapshot[]): void {
  if (snapshots.length === 0) return;

  // First snapshot has no previous reference, churnRate stays 0
  for (let i = 1; i < snapshots.length; i++) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];

    if (curr.totalFiles === 0) {
      curr.churnRate = 0;
    } else {
      const filesChanged = Math.abs(curr.totalFiles - prev.totalFiles);
      curr.churnRate = filesChanged / curr.totalFiles;
    }
  }
}
