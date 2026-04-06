import { describe, it, expect } from 'vitest';
import { analyzeContributions } from '../../../src/analyzers/contributions.js';
import type { CommitRecord } from '../../../src/parsers/log-parser.js';
import type { FileChangeRecord } from '../../../src/parsers/numstat-parser.js';

function makeCommit(overrides: Partial<CommitRecord> = {}): CommitRecord {
  return {
    hash: 'abc123',
    author: 'Alice',
    email: 'alice@example.com',
    date: new Date('2024-03-15T10:30:00Z'), // Friday, hour 10
    message: 'fix stuff',
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
    date: new Date('2024-03-15T10:30:00Z'),
    ...overrides,
  };
}

describe('analyzeContributions', () => {
  it('returns correct stats for multiple authors', () => {
    const commits: CommitRecord[] = [
      makeCommit({ hash: 'a1', author: 'Alice', email: 'alice@ex.com', date: new Date('2024-01-08T09:00:00Z') }), // Monday hour 9
      makeCommit({ hash: 'a2', author: 'Alice', email: 'alice@ex.com', date: new Date('2024-01-08T14:00:00Z') }), // Monday hour 14
      makeCommit({ hash: 'b1', author: 'Bob', email: 'bob@ex.com', date: new Date('2024-01-09T11:00:00Z') }),     // Tuesday hour 11
    ];

    const fileChanges: FileChangeRecord[] = [
      makeFileChange({ commitHash: 'a1', author: 'Alice', linesAdded: 20, linesRemoved: 3 }),
      makeFileChange({ commitHash: 'a2', author: 'Alice', linesAdded: 5, linesRemoved: 2 }),
      makeFileChange({ commitHash: 'b1', author: 'Bob', linesAdded: 50, linesRemoved: 10 }),
    ];

    const result = analyzeContributions(commits, fileChanges);

    expect(result.totalCommits).toBe(3);
    expect(result.authors).toHaveLength(2);

    // Alice has 2 commits, Bob has 1 → Alice ranked first
    expect(result.authors[0].name).toBe('Alice');
    expect(result.authors[0].commits).toBe(2);
    expect(result.authors[0].linesAdded).toBe(25);
    expect(result.authors[0].linesRemoved).toBe(5);

    expect(result.authors[1].name).toBe('Bob');
    expect(result.authors[1].commits).toBe(1);
    expect(result.authors[1].linesAdded).toBe(50);
    expect(result.authors[1].linesRemoved).toBe(10);
  });

  it('returns empty results for empty input', () => {
    const result = analyzeContributions([], []);

    expect(result.totalCommits).toBe(0);
    expect(result.authors).toHaveLength(0);

    // Heatmap should be 7x24 all zeros
    expect(result.heatmap).toHaveLength(7);
    for (const row of result.heatmap) {
      expect(row).toHaveLength(24);
      expect(row.every((v) => v === 0)).toBe(true);
    }
  });

  it('handles single-author edge case', () => {
    const commits: CommitRecord[] = [
      makeCommit({ hash: 'c1', author: 'Solo', email: 'solo@ex.com' }),
    ];
    const fileChanges: FileChangeRecord[] = [
      makeFileChange({ commitHash: 'c1', author: 'Solo', linesAdded: 100, linesRemoved: 0 }),
    ];

    const result = analyzeContributions(commits, fileChanges);

    expect(result.totalCommits).toBe(1);
    expect(result.authors).toHaveLength(1);
    expect(result.authors[0].name).toBe('Solo');
    expect(result.authors[0].commits).toBe(1);
    expect(result.authors[0].linesAdded).toBe(100);
    expect(result.authors[0].linesRemoved).toBe(0);
  });

  it('builds correct heatmap from commit dates', () => {
    // 2024-01-07 is a Sunday
    const commits: CommitRecord[] = [
      makeCommit({ hash: 'h1', date: new Date('2024-01-07T00:00:00Z') }), // Sunday hour 0
      makeCommit({ hash: 'h2', date: new Date('2024-01-07T00:30:00Z') }), // Sunday hour 0
      makeCommit({ hash: 'h3', date: new Date('2024-01-07T23:59:00Z') }), // Sunday hour 23
      makeCommit({ hash: 'h4', date: new Date('2024-01-13T12:00:00Z') }), // Saturday hour 12
    ];

    const result = analyzeContributions(commits, []);

    // Sunday = day 0
    expect(result.heatmap[0][0]).toBe(2);  // two commits at Sunday hour 0
    expect(result.heatmap[0][23]).toBe(1); // one commit at Sunday hour 23
    // Saturday = day 6
    expect(result.heatmap[6][12]).toBe(1); // one commit at Saturday hour 12

    // Total heatmap sum should equal totalCommits
    const heatmapSum = result.heatmap.reduce(
      (sum, row) => sum + row.reduce((s, v) => s + v, 0),
      0,
    );
    expect(heatmapSum).toBe(result.totalCommits);
  });

  it('respects topN parameter', () => {
    const commits: CommitRecord[] = [
      makeCommit({ hash: '1', author: 'A', email: 'a@ex.com' }),
      makeCommit({ hash: '2', author: 'A', email: 'a@ex.com' }),
      makeCommit({ hash: '3', author: 'B', email: 'b@ex.com' }),
      makeCommit({ hash: '4', author: 'C', email: 'c@ex.com' }),
    ];

    const result = analyzeContributions(commits, [], 2);

    // Only top 2 authors returned
    expect(result.authors).toHaveLength(2);
    expect(result.authors[0].name).toBe('A');
    expect(result.authors[0].commits).toBe(2);
    expect(result.authors[1].commits).toBe(1);
    // totalCommits still reflects all commits
    expect(result.totalCommits).toBe(4);
  });

  it('returns all authors when fewer than topN', () => {
    const commits: CommitRecord[] = [
      makeCommit({ hash: '1', author: 'Only', email: 'only@ex.com' }),
    ];

    const result = analyzeContributions(commits, [], 10);

    expect(result.authors).toHaveLength(1);
    expect(result.authors[0].name).toBe('Only');
  });
});
