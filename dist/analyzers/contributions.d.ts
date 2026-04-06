import type { CommitRecord } from '../parsers/log-parser.js';
import type { FileChangeRecord } from '../parsers/numstat-parser.js';
export interface AuthorSummary {
    name: string;
    email: string;
    commits: number;
    linesAdded: number;
    linesRemoved: number;
}
export interface ContributionData {
    authors: AuthorSummary[];
    heatmap: number[][];
    totalCommits: number;
}
/**
 * Analyze contribution patterns from commit records and file change records.
 *
 * - Computes per-author commit counts (keyed by author name)
 * - Aggregates per-author lines added/removed from file changes
 * - Builds a 7×24 heatmap (dayOfWeek × hourOfDay) from commit dates
 * - Returns top-N contributors sorted by commit count descending
 *
 * @param commits - Parsed commit records
 * @param fileChanges - Parsed file change records
 * @param topN - Number of top contributors to return (default 10)
 */
export declare function analyzeContributions(commits: CommitRecord[], fileChanges: FileChangeRecord[], topN?: number): ContributionData;
//# sourceMappingURL=contributions.d.ts.map