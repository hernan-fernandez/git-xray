// Feature: gitpeek, Property 3: Heatmap completeness invariant
// For any set of CommitRecord[], the sum of all cells in the 7×24 heatmap
// should equal the total number of commits. Each commit maps to exactly one cell.
// **Validates: Requirements 2.2**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { analyzeContributions } from '../../src/analyzers/contributions.js';
import type { CommitRecord } from '../../src/parsers/log-parser.js';

const arbHexHash = fc.stringMatching(/^[0-9a-f]{40}$/);
const arbDate = fc.date({ min: new Date('2020-01-01T00:00:00Z'), max: new Date('2025-01-01T00:00:00Z'), noInvalidDate: true });

const arbCommitRecord: fc.Arbitrary<CommitRecord> = fc.record({
  hash: arbHexHash,
  author: fc.stringMatching(/^[A-Za-z]{1,10}$/),
  email: fc.stringMatching(/^[a-z]{1,6}@test\.com$/),
  date: arbDate,
  message: fc.string({ minLength: 1, maxLength: 30 }),
  isMerge: fc.constant(false),
  parentHashes: fc.constant([]),
});

describe('Property 3: Heatmap completeness invariant', () => {
  it('heatmap cell sum equals total commits', () => {
    fc.assert(
      fc.property(
        fc.array(arbCommitRecord, { minLength: 0, maxLength: 100 }),
        (commits) => {
          const result = analyzeContributions(commits, []);

          // Heatmap should be 7×24
          expect(result.heatmap.length).toBe(7);
          for (const row of result.heatmap) {
            expect(row.length).toBe(24);
          }

          // Sum of all heatmap cells should equal totalCommits
          const heatmapSum = result.heatmap.reduce(
            (dayAcc, row) => dayAcc + row.reduce((hourAcc, cell) => hourAcc + cell, 0),
            0,
          );

          expect(heatmapSum).toBe(result.totalCommits);
          expect(heatmapSum).toBe(commits.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});
