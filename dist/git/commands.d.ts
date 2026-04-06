export interface CommandFilters {
    since?: Date;
    until?: Date;
    branch?: string;
    scope?: string;
}
/**
 * Contributions: git log --format="%H|%aN|%aE|%aI|%s|%P"
 * Pipe-delimited commit records (mailmap-resolved)
 */
export declare function contributionLog(filters: CommandFilters): string[];
/**
 * Contributions (stats): git log --numstat --format="%H|%aN|%aI"
 * Numstat with commit headers (mailmap-resolved)
 */
export declare function contributionNumstat(filters: CommandFilters): string[];
/**
 * Hotspots: git log --name-status --format="%H"
 * Commit hash + changed file paths (single pass for all files)
 */
export declare function hotspotLog(filters: CommandFilters): string[];
/**
 * Hotspots (renames): git log --follow --name-only -- <file>
 * Per-file follow for top-20 hotspots only
 */
export declare function hotspotFollowLog(filePath: string, filters: CommandFilters): string[];
/**
 * Complexity: git ls-tree -r -l <tree-ish>
 * Tree entries with file sizes
 */
export declare function lsTree(treeIsh: string): string[];
/**
 * Complexity (snapshots): git rev-list --after=<date> --before=<date> -1 <branch>
 * Commit hash at snapshot point
 */
export declare function revListSnapshot(afterDate: Date, beforeDate: Date, branch: string): string[];
/**
 * PR Velocity: git log --merges --format="%H|%aI|%P|%s"
 * Merge commit records
 */
export declare function mergeLog(filters: CommandFilters): string[];
/**
 * PR Velocity (main-line): git log --first-parent --format="%H"
 * Main-line commit hashes
 */
export declare function firstParentLog(filters: CommandFilters): string[];
//# sourceMappingURL=commands.d.ts.map