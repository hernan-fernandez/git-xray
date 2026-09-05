import { describe, it, expect } from 'vitest';
import { validateRepo, validateGitBinary, validate } from '../../src/validator.js';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** Create a temp directory, optionally initialized as a real git repo. */
async function makeDir(init: 'none' | 'repo' | 'bare' = 'none'): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'git-xray-test-'));
  if (init === 'repo') execSync('git init -q', { cwd: dir, stdio: 'ignore' });
  if (init === 'bare') execSync('git init -q --bare', { cwd: dir, stdio: 'ignore' });
  return dir;
}

describe('validateRepo', () => {
  it('returns valid for a real git repository', async () => {
    const dir = await makeDir('repo');
    try {
      const result = await validateRepo(dir);
      expect(result.valid).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns valid for a bare repository', async () => {
    const dir = await makeDir('bare');
    try {
      const result = await validateRepo(dir);
      expect(result.valid).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns valid for a linked worktree (.git is a file, not a directory)', async () => {
    const main = await makeDir('repo');
    const wtParent = await mkdtemp(join(tmpdir(), 'git-xray-wt-'));
    const wt = join(wtParent, 'wt');
    try {
      execSync('git config user.email "t@t.co"', { cwd: main, stdio: 'ignore' });
      execSync('git config user.name "T"', { cwd: main, stdio: 'ignore' });
      execSync('git commit --allow-empty -m init', { cwd: main, stdio: 'ignore' });
      execSync(`git worktree add "${wt}"`, { cwd: main, stdio: 'ignore' });

      const result = await validateRepo(wt);
      expect(result.valid).toBe(true);
    } finally {
      await rm(wtParent, { recursive: true, force: true });
      await rm(main, { recursive: true, force: true });
    }
  });

  it('returns invalid for a directory that is not a repository', async () => {
    const dir = await makeDir();
    try {
      const result = await validateRepo(dir);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('Not a git repository');
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns invalid when .git is a file with invalid content', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, '.git'), 'not a valid gitfile');
    try {
      const result = await validateRepo(dir);
      expect(result.valid).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('rejects a directory containing only a stray HEAD file', async () => {
    const dir = await makeDir();
    await writeFile(join(dir, 'HEAD'), 'ref: refs/heads/main\n');
    try {
      const result = await validateRepo(dir);
      expect(result.valid).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns invalid for a non-existent path', async () => {
    const result = await validateRepo('/tmp/definitely-does-not-exist-git-xray');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('Path does not exist');
    }
  });

  it('returns invalid when the path is a file, not a directory', async () => {
    const dir = await makeDir();
    const file = join(dir, 'somefile.txt');
    await writeFile(file, 'content');
    try {
      const result = await validateRepo(file);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('Not a directory');
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('validateGitBinary', () => {
  it('returns valid when git is on PATH (expected in CI/dev environments)', async () => {
    const result = await validateGitBinary();
    // This test assumes git is installed in the test environment
    expect(result.valid).toBe(true);
  });
});

describe('validate', () => {
  it('returns valid for a real git repo with git on PATH', async () => {
    const dir = await makeDir('repo');
    try {
      const result = await validate(dir);
      expect(result.valid).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('returns invalid for a non-git directory even if git is on PATH', async () => {
    const dir = await makeDir();
    try {
      const result = await validate(dir);
      expect(result.valid).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
