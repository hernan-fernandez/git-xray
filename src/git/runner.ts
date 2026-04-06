// Git command runner — spawns git commands, returns readable streams

import { spawn } from 'node:child_process';
import { PassThrough, Readable } from 'node:stream';

export interface GitRunner {
  /** Spawns a git command and returns a readable stream of stdout */
  stream(args: string[]): Readable;
  /** Spawns a git command and returns the full stdout as a string */
  exec(args: string[]): Promise<string>;
}

export class GitCommandRunner implements GitRunner {
  private readonly repoPath: string;

  constructor(repoPath: string) {
    this.repoPath = repoPath;
  }

  stream(args: string[]): Readable {
    const child = spawn('git', args, {
      cwd: this.repoPath,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const output = new PassThrough();
    let stderr = '';

    // Pipe stdout but don't auto-end — we control ending based on exit code
    child.stdout.pipe(output, { end: false });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      output.destroy(err);
    });

    child.on('close', (code) => {
      if (code !== 0 && code !== null) {
        const error = new GitError(
          `git ${args[0]} exited with code ${code}: ${stderr.trim()}`,
          code,
          stderr.trim(),
        );
        output.destroy(error);
      } else {
        output.end();
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
      const child = spawn('git', args, {
        cwd: this.repoPath,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on('error', (err) => {
        child.kill('SIGTERM');
        reject(err);
      });

      child.on('close', (code) => {
        if (code === 0 || code === null) {
          resolve(stdout);
        } else {
          reject(
            new GitError(
              `git ${args[0]} exited with code ${code}: ${stderr.trim()}`,
              code,
              stderr.trim(),
            ),
          );
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
