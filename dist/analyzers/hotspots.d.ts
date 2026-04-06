import type { GitRunner } from '../git/runner.js';
import type { CommandFilters } from '../git/commands.js';
export interface FileHotspot {
    filePath: string;
    changeCount: number;
    uniqueAuthors: number;
}
export interface HotspotData {
    hotspots: FileHotspot[];
    warning?: string;
}
export interface NameStatusEntry {
    status: string;
    filePath: string;
}
export interface NameStatusCommit {
    commitHash: string;
    files: NameStatusEntry[];
}
export interface HotspotConfig {
    followRenames: boolean;
    totalCommits: number;
}
/**
 * Phase 1: Compute change frequencies from name-status commit records.
 * Counts distinct commits per file path.
 */
export declare function computeChangeFrequencies(commits: NameStatusCommit[]): Map<string, {
    changeCount: number;
    authors: Set<string>;
}>;
/**
 * Analyze code hotspots from name-status commit data.
 *
 * @param commits - Structured name-status commit records
 * @param config - Whether to follow renames and total commit count
 * @param gitRunner - Git runner for phase 2 follow commands (optional, required if followRenames)
 * @param filters - Command filters for phase 2 follow commands
 */
export declare function analyzeHotspots(commits: NameStatusCommit[], config: HotspotConfig, gitRunner?: GitRunner, filters?: CommandFilters): Promise<HotspotData>;
//# sourceMappingURL=hotspots.d.ts.map