import { describe, it, expect } from 'vitest';
import { validateRepo, validateGitBinary, validate } from '../../src/validator.js';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('validateRepo', () => {
  it('returns valid for a directory with a .git folder', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gitpeek-test-'));
    await mkdir(join(dir, '.git'));
    try {
      const result = await validateRepo(dir);
      expect(result.valid).toBe(true);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  it('returns invalid for a directory without .git', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gitpeek-test-'));
    try {
      const result = await validateRepo(dir);
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.error).toContain('Not a git repository');
      }
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  it('returns invalid when .git is a file, not a directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gitpeek-test-'));
    await writeFile(join(dir, '.git'), 'not a directory');
    try {
      const result = await validateRepo(dir);
      expect(result.valid).toBe(false);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  it('returns invalid for a non-existent path', async () => {
    const result = await validateRepo('/tmp/definitely-does-not-exist-gitpeek');
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain('Not a git repository');
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
  it('returns valid for a directory with .git and git on PATH', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gitpeek-test-'));
    await mkdir(join(dir, '.git'));
    try {
      const result = await validate(dir);
      expect(result.valid).toBe(true);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  it('returns invalid for a non-git directory even if git is on PATH', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'gitpeek-test-'));
    try {
      const result = await validate(dir);
      expect(result.valid).toBe(false);
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});
