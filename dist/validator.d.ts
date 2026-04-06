export interface ValidationSuccess {
    valid: true;
}
export interface ValidationFailure {
    valid: false;
    error: string;
}
export type ValidationResult = ValidationSuccess | ValidationFailure;
/**
 * Validate that the target path contains a `.git` directory.
 */
export declare function validateRepo(repoPath: string): Promise<ValidationResult>;
/**
 * Validate that the `git` binary is available on PATH.
 */
export declare function validateGitBinary(): Promise<ValidationResult>;
/**
 * Run all validations and return the first failure, or success.
 */
export declare function validate(repoPath: string): Promise<ValidationResult>;
//# sourceMappingURL=validator.d.ts.map