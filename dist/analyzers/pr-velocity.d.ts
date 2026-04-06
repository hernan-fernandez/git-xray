import type { MergeRecord } from '../parsers/merge-parser.js';
import type { CommitRecord } from '../parsers/log-parser.js';
export interface PRVelocityData {
    available: boolean;
    averageMergeTime: number | null;
    mergesPerMonth: {
        month: string;
        count: number;
    }[];
    totalMerges: number;
    warningMessage?: string;
}
/**
 * Analyze PR velocity from merge commit patterns.
 *
 * Avoids per-merge `git merge-base` calls by:
 * 1. Using a pre-built main-line commit set (from `git log --first-parent`)
 * 2. For each merge commit's second parent, walking back to find divergence
 *    from main-line (approximates branch creation time)
 *
 * @param mergeRecords - Parsed merge commit records
 * @param allCommits - Full commit history for walking back
 * @param mainLineHashes - Set of commit hashes on the main line (from first-parent log)
 */
export declare function analyzePRVelocity(mergeRecords: MergeRecord[], allCommits: CommitRecord[], mainLineHashes: Set<string>): PRVelocityData;
//# sourceMappingURL=pr-velocity.d.ts.map