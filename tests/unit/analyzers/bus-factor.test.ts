import { describe, it, expect } from 'vitest';
import { analyzeBusFactor } from '../../../src/analyzers/bus-factor.js';
import type { CommitRecord } from '../../../src/parsers/log-parser.js';
import type { FileChangeRecord } from '../../../src/parsers/numstat-parser.js';

const REF_DATE = new Date('2024-06-15T00:00:00Z');

function makeCommit(overrides: Partial<CommitRecord> = {}): CommitRecord {
  return {
    hash: 'abc123',
    author: 'Alice',
    email: 'alice@example.com',
    date: new Date('2024-03-15T10:00:00Z'), // ~3 months ago, full weight
    message: 'commit',
    isMerge: false,
    parentHashes: ['def456'],
    ...overrides,
  };
}

function makeFileChange(overrides: Partial<FileChangeRecord> = {}): FileChangeRecord {
  return {
    commitHash: 'abc123',
    filePath: 'src/index.ts',
    linesAdded: 10,
    linesRemoved: 5,
    author: 'Alice',
    date: new Date('2024-03-15T10:00:00Z'),
    ...overrides,
  };
}

describe('analyzeBusFactor', () => {
  it('returns empty results for empty input', () => {
    const result = analyzeBusFactor([], [], REF_DATE);

    expect(result.overall.busFactor).toBe(0);
    expect(result.overall.topAuthors).toHaveLength(0);
    expect(result.perDirectory.size).toBe(0);
    expect(result.singlePointRisks).toHaveLength(0);
  });

  it('computes bus factor = 1 for single-author repo', () => {
    const commits = [
      makeCommit({ hash: 'a1', author: 'Solo' }),
      makeCommit({ hash: 'a2', author: 'Solo' }),
      makeCommit({ hash: 'a3', author: 'Solo' }),
    ];
    const fileChanges = [
      makeFileChange({ commitHash: 'a1', author: 'Solo', filePath: 'src/a.ts' }),
      makeFileChange({ commitHash: 'a2', author: 'Solo', filePath: 'src/b.ts' }),
    ];

    const result = analyzeBusFactor(commits, fileChanges, REF_DATE);

    expect(result.overall.busFactor).toBe(1);
    expect(result.overall.topAuthors).toHaveLength(1);
    expect(result.overall.topAuthors[0].name).toBe('Solo');
  });

  it('computes correct overall bus factor with known weighted commits', () => {
    // Alice: 5 recent commits (weight ~1.0 each) = ~5.0
    // Bob: 3 recent commits (weight ~1.0 each) = ~3.0
    // Carol: 1 recent commit (weight ~1.0) = ~1.0
    // Total ~9.0, 50% threshold = 4.5
    // Alice alone = 5.0 >= 4.5 → bus factor = 1
    const commits = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeCommit({ hash: `a${i}`, author: 'Alice', date: new Date('2024-05-01T00:00:00Z') }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        makeCommit({ hash: `b${i}`, author: 'Bob', date: new Date('2024-05-01T00:00:00Z') }),
      ),
      makeCommit({ hash: 'c0', author: 'Carol', date: new Date('2024-05-01T00:00:00Z') }),
    ];

    const result = analyzeBusFactor(commits, [], REF_DATE);

    expect(result.overall.busFactor).toBe(1);
    expect(result.overall.topAuthors[0].name).toBe('Alice');
  });

  it('computes bus factor > 1 when no single author dominates', () => {
    // 3 authors with equal recent commits → each ~33%, need 2 for >= 50%
    const commits = [
      ...Array.from({ length: 3 }, (_, i) =>
        makeCommit({ hash: `a${i}`, author: 'Alice', date: new Date('2024-05-01T00:00:00Z') }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        makeCommit({ hash: `b${i}`, author: 'Bob', date: new Date('2024-05-01T00:00:00Z') }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        makeCommit({ hash: `c${i}`, author: 'Carol', date: new Date('2024-05-01T00:00:00Z') }),
      ),
    ];

    const result = analyzeBusFactor(commits, [], REF_DATE);

    expect(result.overall.busFactor).toBe(2);
  });

  it('computes per-directory bus factor', () => {
    const fileChanges = [
      makeFileChange({ commitHash: 'a1', author: 'Alice', filePath: 'src/a.ts', date: new Date('2024-05-01T00:00:00Z') }),
      makeFileChange({ commitHash: 'a2', author: 'Alice', filePath: 'src/b.ts', date: new Date('2024-05-01T00:00:00Z') }),
      makeFileChange({ commitHash: 'b1', author: 'Bob', filePath: 'tests/x.ts', date: new Date('2024-05-01T00:00:00Z') }),
    ];
    const commits = [
      makeCommit({ hash: 'a1', author: 'Alice', date: new Date('2024-05-01T00:00:00Z') }),
      makeCommit({ hash: 'a2', author: 'Alice', date: new Date('2024-05-01T00:00:00Z') }),
      makeCommit({ hash: 'b1', author: 'Bob', date: new Date('2024-05-01T00:00:00Z') }),
    ];

    const result = analyzeBusFactor(commits, fileChanges, REF_DATE);

    expect(result.perDirectory.has('src')).toBe(true);
    expect(result.perDirectory.has('tests')).toBe(true);

    const srcFactor = result.perDirectory.get('src')!;
    expect(srcFactor.busFactor).toBe(1);
    expect(srcFactor.topAuthors[0].name).toBe('Alice');

    const testsFactor = result.perDirectory.get('tests')!;
    expect(testsFactor.busFactor).toBe(1);
    expect(testsFactor.topAuthors[0].name).toBe('Bob');
  });

  it('detects single-point-of-knowledge risks (files with 1 author in last 12 months)', () => {
    const fileChanges = [
      // src/solo.ts: only Alice in last 12 months → risk
      makeFileChange({ commitHash: 'a1', author: 'Alice', filePath: 'src/solo.ts', date: new Date('2024-03-01T00:00:00Z') }),
      // src/shared.ts: Alice and Bob in last 12 months → not a risk
      makeFileChange({ commitHash: 'a2', author: 'Alice', filePath: 'src/shared.ts', date: new Date('2024-03-01T00:00:00Z') }),
      makeFileChange({ commitHash: 'b1', author: 'Bob', filePath: 'src/shared.ts', date: new Date('2024-04-01T00:00:00Z') }),
    ];

    const result = analyzeBusFactor([], fileChanges, REF_DATE);

    expect(result.singlePointRisks).toContain('src/solo.ts');
    expect(result.singlePointRisks).not.toContain('src/shared.ts');
  });

  it('excludes old commits from single-point-of-knowledge detection', () => {
    const fileChanges = [
      // Old commit (> 12 months before ref) by Alice
      makeFileChange({ commitHash: 'a1', author: 'Alice', filePath: 'src/old.ts', date: new Date('2022-01-01T00:00:00Z') }),
      // Recent commit by Bob
      makeFileChange({ commitHash: 'b1', author: 'Bob', filePath: 'src/old.ts', date: new Date('2024-05-01T00:00:00Z') }),
    ];

    const result = analyzeBusFactor([], fileChanges, REF_DATE);

    // Only Bob in last 12 months → single point risk
    expect(result.singlePointRisks).toContain('src/old.ts');
  });

  it('applies time-decay weighting to older commits', () => {
    // Alice: 2 recent commits (full weight ~1.0 each) = ~2.0
    // Bob: 5 old commits (>36 months, weight 0.1 each) = ~0.5
    // Total ~2.5, threshold = 1.25
    // Alice alone = 2.0 >= 1.25 → bus factor = 1
    const commits = [
      makeCommit({ hash: 'a1', author: 'Alice', date: new Date('2024-05-01T00:00:00Z') }),
      makeCommit({ hash: 'a2', author: 'Alice', date: new Date('2024-04-01T00:00:00Z') }),
      ...Array.from({ length: 5 }, (_, i) =>
        makeCommit({ hash: `b${i}`, author: 'Bob', date: new Date('2020-01-01T00:00:00Z') }),
      ),
    ];

    const result = analyzeBusFactor(commits, [], REF_DATE);

    expect(result.overall.busFactor).toBe(1);
    expect(result.overall.topAuthors[0].name).toBe('Alice');
    // Bob's weighted commits should be much less than Alice's
    const bobEntry = result.overall.topAuthors.find(a => a.name === 'Bob');
    expect(bobEntry!.weightedCommits).toBeLessThan(1.0);
  });

  it('root-level files map to "." directory', () => {
    const fileChanges = [
      makeFileChange({ commitHash: 'a1', author: 'Alice', filePath: 'README.md', date: new Date('2024-05-01T00:00:00Z') }),
    ];
    const commits = [
      makeCommit({ hash: 'a1', author: 'Alice', date: new Date('2024-05-01T00:00:00Z') }),
    ];

    const result = analyzeBusFactor(commits, fileChanges, REF_DATE);

    expect(result.perDirectory.has('.')).toBe(true);
  });

  it('uses --until date as reference for time-decay, not current time', () => {
    // Commit from 2022-01-01. If ref is 2022-07-01 → 6 months → full weight
    // If ref is 2026-01-01 → 48 months → 0.1 weight
    const commit = makeCommit({ hash: 'a1', author: 'Alice', date: new Date('2022-01-01T00:00:00Z') });

    const earlyRef = new Date('2022-07-01T00:00:00Z');
    const lateRef = new Date('2026-01-01T00:00:00Z');

    const resultEarly = analyzeBusFactor([commit], [], earlyRef);
    const resultLate = analyzeBusFactor([commit], [], lateRef);

    // With early ref, Alice gets full weight
    expect(resultEarly.overall.topAuthors[0].weightedCommits).toBeCloseTo(1.0, 1);
    // With late ref, Alice gets minimum weight
    expect(resultLate.overall.topAuthors[0].weightedCommits).toBeCloseTo(0.1, 1);
  });
});
