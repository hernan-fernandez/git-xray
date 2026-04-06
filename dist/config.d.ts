export interface GitPeekConfig {
    repoPath: string;
    branch?: string;
    since?: Date;
    until?: Date;
    scope?: string;
    followRenames: boolean;
    output: string;
    noOpen: boolean;
    noColor: boolean;
    json: boolean;
}
export declare class ConfigError extends Error {
    constructor(message: string);
}
export declare function parseConfig(argv: string[]): GitPeekConfig;
//# sourceMappingURL=config.d.ts.map