// Repository and git binary validation

import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';

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
export async function validateRepo(repoPath: string): Promise<ValidationResult> {
  const gitDir = resolve(repoPath, '.git');
  try {
    const stat = await fs.stat(gitDir);
    if (!stat.isDirectory()) {
      return { valid: false, error: `Not a git repository: ${repoPath}` };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: `Not a git repository: ${repoPath}` };
  }
}

/**
 * Validate that the `git` binary is available on PATH.
 */
export async function validateGitBinary(): Promise<ValidationResult> {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    execFile(cmd, ['git'], (error) => {
      if (error) {
        resolve({
          valid: false,
          error: 'git is not installed. Install it from https://git-scm.com',
        });
      } else {
        resolve({ valid: true });
      }
    });
  });
}

/**
 * Run all validations and return the first failure, or success.
 */
export async function validate(repoPath: string): Promise<ValidationResult> {
  const gitBinaryResult = await validateGitBinary();
  if (!gitBinaryResult.valid) return gitBinaryResult;

  const repoResult = await validateRepo(repoPath);
  if (!repoResult.valid) return repoResult;

  return { valid: true };
}
