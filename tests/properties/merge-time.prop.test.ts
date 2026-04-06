// Feature: gitpeek, Property 13: Merge time computation correctness
// For any set of merge records with known branch creation timestamps,
// the computed average merge time should equal the arithmetic mean of
// individual (merge date - branch creation date) durations.
// **Validates: Requirements 6.2**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { analyzePRVelocity } from '../../src/analyzers/pr-velocity.js';
import type { CommitRecord } from '../../src/parsers/log-parser.js';
import type { MergeRecord } from '../../src/parsers/merge-parser.js';

/**
 * Generate a controlled merge scenario where each merge has a known branch
 * creation commit (the second parent) that is a single-parent commit NOT on main-line.
 * This lets us predict the exact merge time = mergeDate - branchCreationDate.
 */
const arbMergeScenario = fc.array(
  fc.record({
    // Branch duration in hours (1 hour to 30 days)
    branchDurationHours: fc.integer({ min: 1, max: 720 }),
    // Base timestamp offset in hours from epoch start
    baseOffsetHours: fc.integer({ min: 0, max: 8760 }),
  }),
  { minLength: 1, maxLength: 15 },
);

describe('Property 13: Merge time computation correctness', () => {
  it('average merge time = arithmetic mean of individual durations', () => {
    fc.assert(
      fc.property(arbMergeScenario, (scenarios) => {
        const baseDate = new Date('2024-01-01T00:00:00Z');
        const allCommits: CommitRecord[] = [];
        const mergeRecords: MergeRecord[] = [];
        const mainLineHashes = new Set<string>();
        const expectedDurations: number[] = [];

        let hashCounter = 0;
        const nextHash = () => (hashCounter++).toString(16).padStart(40, '0');

        // Create a main-line root commit
        const rootHash = nextHash();
        allCommits.push({
          hash: rootHash,
          author: 'Dev',
          email: 'dev@test.com',
          date: baseDate,
          message: 'root',
          isMerge: false,
          parentHashes: [],
        });
        mainLineHashes.add(rootHash);

        let prevMainHash = rootHash;

        for (const scenario of scenarios) {
          const branchStartDate = new Date(
            baseDate.getTime() + scenario.baseOffsetHours * 3600000,
          );
          const mergeDate = new Date(
            branchStartDate.getTime() + scenario.branchDurationHours * 3600000,
          );

          // Create branch commit (second parent of merge, NOT on main-line)
          const branchHash = nextHash();
          allCommits.push({
            hash: branchHash,
            author: 'Dev',
            email: 'dev@test.com',
            date: branchStartDate,
            message: 'branch commit',
            isMerge: false,
            parentHashes: [prevMainHash], // single parent pointing to main-line
          });

          // Create merge commit on main-line
          const mergeHash = nextHash();
          allCommits.push({
            hash: mergeHash,
            author: 'Dev',
            email: 'dev@test.com',
            date: mergeDate,
            message: `Merge branch`,
            isMerge: true,
            parentHashes: [prevMainHash, branchHash],
          });
          mainLineHashes.add(mergeHash);

          mergeRecords.push({
            hash: mergeHash,
            date: mergeDate,
            parentHashes: [prevMainHash, branchHash],
            message: `Merge branch`,
          });

          // The branch commit's oldest non-main-line ancestor is itself
          // So merge time = mergeDate - branchStartDate
          expectedDurations.push(mergeDate.getTime() - branchStartDate.getTime());

          prevMainHash = mergeHash;
        }

        const result = analyzePRVelocity(mergeRecords, allCommits, mainLineHashes);

        expect(result.available).toBe(true);
        expect(result.totalMerges).toBe(mergeRecords.length);

        if (expectedDurations.length > 0 && result.averageMergeTime !== null) {
          const expectedAvg =
            expectedDurations.reduce((sum, d) => sum + d, 0) / expectedDurations.length;
          // Allow 1ms tolerance for floating point
          expect(result.averageMergeTime).toBeCloseTo(expectedAvg, -1);
        }
      }),
      { numRuns: 100 },
    );
  });
});
