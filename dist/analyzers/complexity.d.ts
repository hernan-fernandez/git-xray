import type { GitRunner } from '../git/runner.js';
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
/**
 * Determine whether to use monthly or weekly intervals.
 * Monthly if the date range spans >= 3 months, weekly otherwise.
 */
export declare function determineInterval(from: Date, to: Date): 'weekly' | 'monthly';
/**
 * Generate snapshot sample dates between `from` and `to`.
 * Monthly: first day of each month within the range.
 * Weekly: every 7 days starting from `from`.
 */
export declare function generateSnapshotDates(from: Date, to: Date, interval: 'weekly' | 'monthly'): Date[];
/**
 * Parse ls-tree output string into TreeEntry objects.
 * Used when we have the full output as a string from exec().
 */
export declare function parseLsTreeOutput(output: string, scope?: string): {
    totalFiles: number;
    totalSize: number;
};
/**
 * Analyze complexity trends by sampling repository snapshots.
 *
 * @param config - Date range, branch, and optional scope
 * @param gitRunner - Git command runner
 * @returns ComplexityTrendData with snapshots and interval
 */
export declare function analyzeComplexityTrend(config: ComplexityConfig, gitRunner: GitRunner): Promise<ComplexityTrendData>;
/**
 * Compute churn rates between consecutive snapshots.
 * churnRate for snapshot[i] = |totalFiles[i] - totalFiles[i-1]| / totalFiles[i]
 * First snapshot has churnRate = 0.
 */
export declare function computeChurnRates(snapshots: ComplexitySnapshot[]): void;
//# sourceMappingURL=complexity.d.ts.map