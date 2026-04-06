import { describe, it, expect } from 'vitest';
import { analyzePRVelocity } from '../../../src/analyzers/pr-velocity.js';
import type { MergeRecord } from '../../../src/parsers/merge-parser.js';
import type { CommitRecord } from '../../../src/parsers/log-parser.js';

function makeCommit(overrides: Partial<CommitRecord> = {}): CommitRecord {
  return {
    hash: 'aaa',
    author: 'Alice',
    email: 'alice@example.com',
    date: new Date('2024-03-15T10:00:00Z'),
    message: 'commit',
    isMerge: false,
    parentHashes: [],
    ...overrides,
  };
}

function makeMerge(overrides: Partial<MergeRecord> = {}): MergeRecord {
  return {
    hash: 'merge1',
    date: new Date('2024-03-20T10:00:00Z'),
    parentHashes: ['main1', 'branch1'],
    message: 'Merge branch feature',
    ...overrides,
  };
}

describe('analyzePRVelocity', () => {
  describe('linear history (no merges)', () => {
    it('returns available=false with warning when no merge commits found', () => {
      const result = analyzePRVelocity([], [], new Set());

      expect(result.available).toBe(false);
      expect(result.averageMergeTime).toBeNull();
      expect(result.mergesPerMonth).toEqual([]);
      expect(result.totalMerges).toBe(0);
      expect(result.warningMessage).toBeDefined();
      expect(result.warningMessage).toContain('rebase');
    });
  });

  describe('single merge edge case', () => {
    it('computes merge time for a single merge commit', () => {
      // Main line: root -> main1 -> merge1
      // Branch:    root -> branch1 (created 2 days before merge)
      const mainLineHashes = new Set(['root', 'main1', 'merge1']);

      const allCommits: CommitRecord[] = [
        makeCommit({ hash: 'root', date: new Date('2024-03-01T00:00:00Z'), parentHashes: [] }),
        makeCommit({ hash: 'main1', date: new Date('2024-03-10T00:00:00Z'), parentHashes: ['root'] }),
        makeCommit({ hash: 'branch1', date: new Date('2024-03-18T00:00:00Z'), parentHashes: ['root'] }),
        makeCommit({
          hash: 'merge1',
          date: new Date('2024-03-20T00:00:00Z'),
          parentHashes: ['main1', 'branch1'],
          isMerge: true,
        }),
      ];

      const mergeRecords: MergeRecord[] = [
        makeMerge({
          hash: 'merge1',
          date: new Date('2024-03-20T00:00:00Z'),
          parentHashes: ['main1', 'branch1'],
        }),
      ];

      const result = analyzePRVelocity(mergeRecords, allCommits, mainLineHashes);

      expect(result.available).toBe(true);
      expect(result.totalMerges).toBe(1);
      // branch1 was created on Mar 18, merged on Mar 20 → 2 days = 172800000 ms
      expect(result.averageMergeTime).toBe(2 * 24 * 60 * 60 * 1000);
      expect(result.mergesPerMonth).toEqual([{ month: '2024-03', count: 1 }]);
      expect(result.warningMessage).toBeUndefined();
    });
  });

  describe('known merge history', () => {
    it('computes average merge time across multiple merges', () => {
      // Main line: root -> m1 -> merge_a -> m2 -> merge_b
      // Branch A: root -> b_a1 (1 day before merge_a)
      // Branch B: m1 -> b_b1 -> b_b2 (b_b1 is 3 days before merge_b)
      const mainLineHashes = new Set(['root', 'm1', 'merge_a', 'm2', 'merge_b']);

      const allCommits: CommitRecord[] = [
        makeCommit({ hash: 'root', date: new Date('2024-01-01T00:00:00Z'), parentHashes: [] }),
        makeCommit({ hash: 'm1', date: new Date('2024-01-05T00:00:00Z'), parentHashes: ['root'] }),
        makeCommit({ hash: 'b_a1', date: new Date('2024-01-09T00:00:00Z'), parentHashes: ['root'] }),
        makeCommit({
          hash: 'merge_a',
          date: new Date('2024-01-10T00:00:00Z'),
          parentHashes: ['m1', 'b_a1'],
          isMerge: true,
        }),
        makeCommit({ hash: 'm2', date: new Date('2024-01-15T00:00:00Z'), parentHashes: ['merge_a'] }),
        makeCommit({ hash: 'b_b1', date: new Date('2024-02-17T00:00:00Z'), parentHashes: ['m1'] }),
        makeCommit({ hash: 'b_b2', date: new Date('2024-02-19T00:00:00Z'), parentHashes: ['b_b1'] }),
        makeCommit({
          hash: 'merge_b',
          date: new Date('2024-02-20T00:00:00Z'),
          parentHashes: ['m2', 'b_b2'],
          isMerge: true,
        }),
      ];

      const mergeRecords: MergeRecord[] = [
        makeMerge({
          hash: 'merge_a',
          date: new Date('2024-01-10T00:00:00Z'),
          parentHashes: ['m1', 'b_a1'],
        }),
        makeMerge({
          hash: 'merge_b',
          date: new Date('2024-02-20T00:00:00Z'),
          parentHashes: ['m2', 'b_b2'],
        }),
      ];

      const result = analyzePRVelocity(mergeRecords, allCommits, mainLineHashes);

      expect(result.available).toBe(true);
      expect(result.totalMerges).toBe(2);

      // Merge A: branch b_a1 created Jan 9, merged Jan 10 → 1 day
      // Merge B: branch b_b1 created Feb 17 (oldest non-main), merged Feb 20 → 3 days
      // Average = (1 + 3) / 2 = 2 days
      const oneDay = 24 * 60 * 60 * 1000;
      expect(result.averageMergeTime).toBe(2 * oneDay);

      // Merges per month
      expect(result.mergesPerMonth).toEqual([
        { month: '2024-01', count: 1 },
        { month: '2024-02', count: 1 },
      ]);
    });
  });

  describe('nested merge scenario', () => {
    it('handles second parent with multiple parents (nested merge)', () => {
      // Main line: root -> m1 -> final_merge
      // Branch: root -> nested_merge -> leaf
      //   nested_merge itself is a merge: parents are [sub_a, sub_b]
      //   sub_a and sub_b are not on main-line
      // The walk should find the oldest non-main-line commit
      const mainLineHashes = new Set(['root', 'm1', 'final_merge']);

      const allCommits: CommitRecord[] = [
        makeCommit({ hash: 'root', date: new Date('2024-04-01T00:00:00Z'), parentHashes: [] }),
        makeCommit({ hash: 'm1', date: new Date('2024-04-05T00:00:00Z'), parentHashes: ['root'] }),
        // sub_a and sub_b are branch commits
        makeCommit({ hash: 'sub_a', date: new Date('2024-04-06T00:00:00Z'), parentHashes: ['root'] }),
        makeCommit({ hash: 'sub_b', date: new Date('2024-04-07T00:00:00Z'), parentHashes: ['root'] }),
        // nested_merge merges sub_a and sub_b (not on main-line)
        makeCommit({
          hash: 'nested_merge',
          date: new Date('2024-04-08T00:00:00Z'),
          parentHashes: ['sub_a', 'sub_b'],
          isMerge: true,
        }),
        // leaf commit after nested merge
        makeCommit({ hash: 'leaf', date: new Date('2024-04-09T00:00:00Z'), parentHashes: ['nested_merge'] }),
        // final merge brings the branch into main
        makeCommit({
          hash: 'final_merge',
          date: new Date('2024-04-10T00:00:00Z'),
          parentHashes: ['m1', 'leaf'],
          isMerge: true,
        }),
      ];

      const mergeRecords: MergeRecord[] = [
        makeMerge({
          hash: 'final_merge',
          date: new Date('2024-04-10T00:00:00Z'),
          parentHashes: ['m1', 'leaf'],
        }),
      ];

      const result = analyzePRVelocity(mergeRecords, allCommits, mainLineHashes);

      expect(result.available).toBe(true);
      expect(result.totalMerges).toBe(1);

      // Walk from 'leaf' → nested_merge → sub_a, sub_b
      // sub_a (Apr 6) is the oldest non-main-line commit
      // Merge time = Apr 10 - Apr 6 = 4 days
      const oneDay = 24 * 60 * 60 * 1000;
      expect(result.averageMergeTime).toBe(4 * oneDay);
    });
  });

  describe('merges-per-month grouping', () => {
    it('groups merges correctly by YYYY-MM', () => {
      const mainLineHashes = new Set(['root', 'm1', 'm2', 'm3', 'mg1', 'mg2', 'mg3']);

      const allCommits: CommitRecord[] = [
        makeCommit({ hash: 'root', date: new Date('2024-01-01T00:00:00Z'), parentHashes: [] }),
        makeCommit({ hash: 'm1', date: new Date('2024-01-02T00:00:00Z'), parentHashes: ['root'] }),
        makeCommit({ hash: 'b1', date: new Date('2024-01-03T00:00:00Z'), parentHashes: ['root'] }),
        makeCommit({ hash: 'mg1', date: new Date('2024-01-10T00:00:00Z'), parentHashes: ['m1', 'b1'], isMerge: true }),
        makeCommit({ hash: 'm2', date: new Date('2024-01-15T00:00:00Z'), parentHashes: ['mg1'] }),
        makeCommit({ hash: 'b2', date: new Date('2024-01-16T00:00:00Z'), parentHashes: ['m1'] }),
        makeCommit({ hash: 'mg2', date: new Date('2024-01-20T00:00:00Z'), parentHashes: ['m2', 'b2'], isMerge: true }),
        makeCommit({ hash: 'm3', date: new Date('2024-02-01T00:00:00Z'), parentHashes: ['mg2'] }),
        makeCommit({ hash: 'b3', date: new Date('2024-02-02T00:00:00Z'), parentHashes: ['mg2'] }),
        makeCommit({ hash: 'mg3', date: new Date('2024-02-05T00:00:00Z'), parentHashes: ['m3', 'b3'], isMerge: true }),
      ];

      const mergeRecords: MergeRecord[] = [
        makeMerge({ hash: 'mg1', date: new Date('2024-01-10T00:00:00Z'), parentHashes: ['m1', 'b1'] }),
        makeMerge({ hash: 'mg2', date: new Date('2024-01-20T00:00:00Z'), parentHashes: ['m2', 'b2'] }),
        makeMerge({ hash: 'mg3', date: new Date('2024-02-05T00:00:00Z'), parentHashes: ['m3', 'b3'] }),
      ];

      const result = analyzePRVelocity(mergeRecords, allCommits, mainLineHashes);

      expect(result.mergesPerMonth).toEqual([
        { month: '2024-01', count: 2 },
        { month: '2024-02', count: 1 },
      ]);
      // Total should match sum of monthly counts
      expect(result.totalMerges).toBe(3);
    });
  });

  describe('edge cases', () => {
    it('handles merge where second parent is already on main-line', () => {
      // If the second parent is on main-line, we can't determine branch creation
      const mainLineHashes = new Set(['root', 'm1', 'merge1']);

      const allCommits: CommitRecord[] = [
        makeCommit({ hash: 'root', date: new Date('2024-01-01T00:00:00Z'), parentHashes: [] }),
        makeCommit({ hash: 'm1', date: new Date('2024-01-05T00:00:00Z'), parentHashes: ['root'] }),
        makeCommit({
          hash: 'merge1',
          date: new Date('2024-01-10T00:00:00Z'),
          parentHashes: ['m1', 'root'], // second parent is on main-line
          isMerge: true,
        }),
      ];

      const mergeRecords: MergeRecord[] = [
        makeMerge({
          hash: 'merge1',
          date: new Date('2024-01-10T00:00:00Z'),
          parentHashes: ['m1', 'root'],
        }),
      ];

      const result = analyzePRVelocity(mergeRecords, allCommits, mainLineHashes);

      expect(result.available).toBe(true);
      expect(result.totalMerges).toBe(1);
      // No valid merge time since second parent is on main-line
      expect(result.averageMergeTime).toBeNull();
    });

    it('handles merge where second parent commit is not in allCommits', () => {
      const mainLineHashes = new Set(['root', 'm1', 'merge1']);

      const allCommits: CommitRecord[] = [
        makeCommit({ hash: 'root', date: new Date('2024-01-01T00:00:00Z'), parentHashes: [] }),
        makeCommit({ hash: 'm1', date: new Date('2024-01-05T00:00:00Z'), parentHashes: ['root'] }),
        // 'unknown_branch' is NOT in allCommits
      ];

      const mergeRecords: MergeRecord[] = [
        makeMerge({
          hash: 'merge1',
          date: new Date('2024-01-10T00:00:00Z'),
          parentHashes: ['m1', 'unknown_branch'],
        }),
      ];

      const result = analyzePRVelocity(mergeRecords, allCommits, mainLineHashes);

      expect(result.available).toBe(true);
      expect(result.totalMerges).toBe(1);
      // Can't walk unknown commit → no merge time
      expect(result.averageMergeTime).toBeNull();
    });
  });
});
