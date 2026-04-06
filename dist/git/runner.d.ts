import { Readable } from 'node:stream';
export interface GitRunner {
    /** Spawns a git command and returns a readable stream of stdout */
    stream(args: string[]): Readable;
    /** Spawns a git command and returns the full stdout as a string */
    exec(args: string[]): Promise<string>;
}
export declare class GitCommandRunner implements GitRunner {
    private readonly repoPath;
    constructor(repoPath: string);
    stream(args: string[]): Readable;
    exec(args: string[]): Promise<string>;
}
export declare class GitError extends Error {
    readonly exitCode: number;
    readonly stderr: string;
    constructor(message: string, exitCode: number, stderr: string);
}
//# sourceMappingURL=runner.d.ts.map