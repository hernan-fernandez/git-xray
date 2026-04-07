// Remote repo cloning support
// Detects URLs and clones to a temp directory for analysis

import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';

export interface CloneInfo {
  path: string;
  url: string;
}

const URL_PATTERNS = [
  /^https?:\/\//i,
  /^git@/,
  /^ssh:\/\//i,
  /^git:\/\//i,
];

/**
 * Check if a string looks like a git remote URL.
 */
export function isGitUrl(input: string): boolean {
  return URL_PATTERNS.some(p => p.test(input));
}

/**
 * Extract a repo name from a URL for display purposes.
 * e.g. "https://github.com/org/repo.git" → "repo"
 */
export function repoNameFromUrl(url: string): string {
  const cleaned = url.replace(/\.git$/, '').replace(/\/$/, '');
  const lastSlash = cleaned.lastIndexOf('/');
  return lastSlash >= 0 ? cleaned.substring(lastSlash + 1) : cleaned;
}

/**
 * If the input is a URL, clone it to a temp directory and return the path.
 * Returns null if the input is not a URL (i.e., it's a local path).
 */
export async function cloneIfUrl(input: string): Promise<CloneInfo | null> {
  if (!isGitUrl(input)) return null;

  const name = repoNameFromUrl(input);
  const tempDir = await mkdtemp(join(tmpdir(), `git-xray-${name}-`));

  process.stderr.write(`Cloning ${input}...\n`);

  await new Promise<void>((resolve, reject) => {
    // Use --bare for speed (no working tree needed, we only read git history)
    const child = spawn('git', ['clone', '--bare', input, tempDir], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      const msg = chunk.toString();
      stderr += msg;
      // Show clone progress to the user
      process.stderr.write(`\r\x1b[K${msg.trim()}`);
    });

    child.on('close', (code) => {
      process.stderr.write('\r\x1b[K'); // Clear progress line
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Failed to clone ${input}: ${stderr.trim()}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`Failed to clone ${input}: ${err.message}`));
    });
  });

  process.stderr.write(`Cloned to temp directory. Analyzing...\n`);

  return { path: tempDir, url: input };
}

/**
 * Clean up a temporary clone directory.
 */
export async function cleanupClone(path: string): Promise<void> {
  try {
    await rm(path, { recursive: true, force: true });
  } catch {
    // Best effort cleanup
  }
}
