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
 * Validate that the target path is a git repository.
 *
 * Uses `git rev-parse --git-dir` as the authoritative check, which correctly
 * handles regular repos, bare repos, worktrees, and submodules (whose .git is
 * a file, not a directory) — and rejects directories that merely contain a
 * stray HEAD file.
 */
export async function validateRepo(repoPath: string): Promise<ValidationResult> {
  // Distinguish "path doesn't exist" from "exists but isn't a repo"
  try {
    const stat = await fs.stat(resolve(repoPath));
    if (!stat.isDirectory()) {
      return { valid: false, error: `Not a directory: ${repoPath}` };
    }
  } catch {
    return { valid: false, error: `Path does not exist: ${repoPath}` };
  }

  return new Promise((resolvePromise) => {
    execFile('git', ['-C', repoPath, 'rev-parse', '--git-dir'], (error) => {
      if (error) {
        resolvePromise({ valid: false, error: `Not a git repository: ${repoPath}` });
      } else {
        resolvePromise({ valid: true });
      }
    });
  });
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
