import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GitCommandRunner, GitError } from '../../../src/git/runner.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let repoPath: string;

beforeAll(() => {
  // Create a temporary git repo for testing
  repoPath = mkdtempSync(join(tmpdir(), 'gitpeek-test-'));
  execSync('git init', { cwd: repoPath, stdio: 'ignore' });
  execSync('git config user.email "test@test.com"', { cwd: repoPath, stdio: 'ignore' });
  execSync('git config user.name "Test"', { cwd: repoPath, stdio: 'ignore' });
  execSync('git commit --allow-empty -m "init"', { cwd: repoPath, stdio: 'ignore' });
});

afterAll(() => {
  rmSync(repoPath, { recursive: true, force: true });
});

describe('GitCommandRunner', () => {
  describe('exec', () => {
    it('should return stdout for a successful git command', async () => {
      const runner = new GitCommandRunner(repoPath);
      const result = await runner.exec(['rev-parse', '--is-inside-work-tree']);
      expect(result.trim()).toBe('true');
    });

    it('should reject with GitError on non-zero exit code', async () => {
      const runner = new GitCommandRunner(repoPath);
      await expect(runner.exec(['log', '--invalid-flag-xyz'])).rejects.toThrow(GitError);
    });

    it('should include exit code and stderr in GitError', async () => {
      const runner = new GitCommandRunner(repoPath);
      try {
        await runner.exec(['log', '--invalid-flag-xyz']);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(GitError);
        const gitErr = err as GitError;
        expect(gitErr.exitCode).toBeGreaterThan(0);
        expect(gitErr.stderr.length).toBeGreaterThan(0);
      }
    });

    it('should reject when repo path does not exist', async () => {
      const runner = new GitCommandRunner('/nonexistent/path/to/repo');
      await expect(runner.exec(['status'])).rejects.toThrow();
    });
  });

  describe('stream', () => {
    it('should return a readable stream with git output', async () => {
      const runner = new GitCommandRunner(repoPath);
      const stream = runner.stream(['rev-parse', '--is-inside-work-tree']);

      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk as Buffer);
      }
      const output = Buffer.concat(chunks).toString().trim();
      expect(output).toBe('true');
    });

    it('should emit error on stream for non-zero exit code', async () => {
      const runner = new GitCommandRunner(repoPath);
      const stream = runner.stream(['log', '--invalid-flag-xyz']);

      const error = await new Promise<Error>((resolve, reject) => {
        stream.on('error', (err) => resolve(err));
        stream.on('end', () => reject(new Error('Stream ended without error')));
        stream.resume(); // consume to trigger close
      });
      expect(error).toBeDefined();
      expect(error.message).toContain('exited with code');
    });
  });
});
