// Feature: gitpeek, Property 4: Contributor ranking correctness
// For any set of AuthorSummary[], the top-N contributors list should be sorted
// in non-increasing order by commit count, and its length should be min(N, totalAuthors).
// **Validates: Requirements 2.3, 2.4**

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

describe('Property 4: Contributor ranking correctness', () => {
  it('top-N sorted non-increasing, length = min(N, totalAuthors)', () => {
    fc.assert(
      fc.property(
        fc.array(arbCommitRecord, { minLength: 1, maxLength: 80 }),
        fc.integer({ min: 1, max: 30 }),
        (commits, topN) => {
          const result = analyzeContributions(commits, [], topN);

          // Count distinct authors in input
          const distinctAuthors = new Set(commits.map((c) => c.author)).size;

          // Length should be min(N, totalAuthors)
          expect(result.authors.length).toBe(Math.min(topN, distinctAuthors));

          // Should be sorted in non-increasing order by commit count
          for (let i = 1; i < result.authors.length; i++) {
            expect(result.authors[i - 1].commits).toBeGreaterThanOrEqual(
              result.authors[i].commits,
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
