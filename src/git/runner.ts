// Git command runner — spawns git commands, returns readable streams

import { spawn } from 'node:child_process';
import { PassThrough, Readable } from 'node:stream';

export interface GitRunner {
  /** Spawns a git command and returns a readable stream of stdout */
  stream(args: string[]): Readable;
  /** Spawns a git command and returns the full stdout as a string */
  exec(args: string[]): Promise<string>;
}

/**
 * Config args prepended to every git invocation.
 * core.quotePath=off makes git emit non-ASCII file paths verbatim instead of
 * C-quoted octal escapes ("\303\244.ts"), so parsers see the real paths.
 */
const GIT_BASE_ARGS = ['-c', 'core.quotePath=off'];

export class GitCommandRunner implements GitRunner {
  private readonly repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
  }

  stream(args: string[]): Readable {
    const child = spawn('git', [...GIT_BASE_ARGS, ...args], {
      cwd: this.repoPath,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const output = new PassThrough();
    let stderr = '';

    // Decode as UTF-8 at the source so multi-byte characters split across
    // chunk boundaries are re-assembled here instead of corrupting downstream.
    child.stdout.setEncoding('utf8');

    // Pipe stdout but don't auto-end — we control ending based on exit code
    child.stdout.pipe(output, { end: false });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      output.destroy(err);
    });

    child.on('close', (code, signal) => {
      if (code === 0) {
        output.end();
      } else if (code === null && output.destroyed) {
        // We killed the child because the consumer destroyed the stream —
        // expected teardown, not an error.
      } else {
        // Non-zero exit, or killed by a signal (code === null): partial
        // output must not be silently treated as a complete result.
        const desc =
          code !== null ? `exited with code ${code}` : `was killed by ${signal ?? 'a signal'}`;
        const error = new GitError(
          `git ${args[0]} ${desc}: ${stderr.trim()}`,
          code ?? -1,
          stderr.trim(),
        );
        output.destroy(error);
      }
    });

    // Ensure cleanup: send SIGTERM if the consumer destroys the stream early
    output.on('close', () => {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
      }
    });

    return output;
  }

  async exec(args: string[]): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const child = spawn('git', [...GIT_BASE_ARGS, ...args], {
        cwd: this.repoPath,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      // UTF-8 decode at the source (see stream() above)
      child.stdout.setEncoding('utf8');

      child.stdout.on('data', (chunk: string) => {
        stdout += chunk;
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on('error', (err) => {
        child.kill('SIGTERM');
        reject(err);
      });

      child.on('close', (code, signal) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          // Non-zero exit, or killed by a signal (code === null): partial
          // output must not be silently treated as a complete result.
          const desc =
            code !== null ? `exited with code ${code}` : `was killed by ${signal ?? 'a signal'}`;
          reject(new GitError(`git ${args[0]} ${desc}: ${stderr.trim()}`, code ?? -1, stderr.trim()));
        }
      });
    });
  }
}

export class GitError extends Error {
  readonly exitCode: number;
  readonly stderr: string;

  constructor(message: string, exitCode: number, stderr: string) {
    super(message);
    this.name = 'GitError';
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}
