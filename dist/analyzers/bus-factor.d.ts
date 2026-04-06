import type { CommitRecord } from '../parsers/log-parser.js';
import type { FileChangeRecord } from '../parsers/numstat-parser.js';
export interface BusFactorResult {
    scope: string;
    busFactor: number;
    topAuthors: {
        name: string;
        weightedCommits: number;
    }[];
}
export interface BusFactorData {
    overall: BusFactorResult;
    perDirectory: Map<string, BusFactorResult>;
    singlePointRisks: string[];
}
/**
 * Analyze bus factor for the repository.
 *
 * @param commits - Parsed commit records (author identity resolved via .mailmap through %aN/%aE)
 * @param fileChanges - Parsed file change records
 * @param referenceDate - The --until date or current system time
 */
export declare function analyzeBusFactor(commits: CommitRecord[], fileChanges: FileChangeRecord[], referenceDate: Date): BusFactorData;
//# sourceMappingURL=bus-factor.d.ts.map