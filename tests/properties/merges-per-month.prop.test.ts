// Feature: gitpeek, Property 14: Merges-per-month completeness
// For any set of merge records, the sum of all merges-per-month counts
// should equal totalMerges.
// **Validates: Requirements 6.3**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { analyzePRVelocity } from '../../src/analyzers/pr-velocity.js';
import type { CommitRecord } from '../../src/parsers/log-parser.js';
import type { MergeRecord } from '../../src/parsers/merge-parser.js';

const arbMergeDate = fc.date({
  min: new Date('2022-01-01T00:00:00Z'),
  max: new Date('2025-01-01T00:00:00Z'),
  noInvalidDate: true,
});

const arbMergeRecord = fc.record({
  date: arbMergeDate,
});

describe('Property 14: Merges-per-month completeness', () => {
  it('sum of monthly counts = totalMerges', () => {
    fc.assert(
      fc.property(
        fc.array(arbMergeRecord, { minLength: 1, maxLength: 50 }),
        (mergeInputs) => {
          let hashCounter = 0;
          const nextHash = () => (hashCounter++).toString(16).padStart(40, '0');

          // Build a root main-line commit
          const rootHash = nextHash();
          const mainLineHashes = new Set<string>([rootHash]);
          const allCommits: CommitRecord[] = [
            {
              hash: rootHash,
              author: 'Dev',
              email: 'dev@test.com',
              date: new Date('2021-12-01T00:00:00Z'),
              message: 'root',
              isMerge: false,
              parentHashes: [],
            },
          ];

          const mergeRecords: MergeRecord[] = [];
          let prevMainHash = rootHash;

          for (const input of mergeInputs) {
            // Create a branch commit (not on main-line)
            const branchHash = nextHash();
            const branchDate = new Date(input.date.getTime() - 3600000); // 1 hour before merge
            allCommits.push({
              hash: branchHash,
              author: 'Dev',
              email: 'dev@test.com',
              date: branchDate,
              message: 'branch',
              isMerge: false,
              parentHashes: [prevMainHash],
            });

            // Create merge commit on main-line
            const mergeHash = nextHash();
            allCommits.push({
              hash: mergeHash,
              author: 'Dev',
              email: 'dev@test.com',
              date: input.date,
              message: 'merge',
              isMerge: true,
              parentHashes: [prevMainHash, branchHash],
            });
            mainLineHashes.add(mergeHash);

            mergeRecords.push({
              hash: mergeHash,
              date: input.date,
              parentHashes: [prevMainHash, branchHash],
              message: 'merge',
            });

            prevMainHash = mergeHash;
          }

          const result = analyzePRVelocity(mergeRecords, allCommits, mainLineHashes);

          expect(result.available).toBe(true);
          expect(result.totalMerges).toBe(mergeRecords.length);

          // Sum of mergesPerMonth counts should equal totalMerges
          const monthlySum = result.mergesPerMonth.reduce((sum, m) => sum + m.count, 0);
          expect(monthlySum).toBe(result.totalMerges);
        },
      ),
      { numRuns: 100 },
    );
  });
});
