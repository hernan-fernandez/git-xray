// Feature: gitpeek, Property 10: Bus factor threshold correctness
// For any set of authors with weighted commit counts, the computed bus factor N
// should satisfy: top N authors ≥ 50% of total, and top N-1 < 50%.
// **Validates: Requirements 5.1, 5.2, 5.3**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { analyzeBusFactor } from '../../src/analyzers/bus-factor.js';
import type { CommitRecord } from '../../src/parsers/log-parser.js';
import type { FileChangeRecord } from '../../src/parsers/numstat-parser.js';

// Generate commits where each author has a known number of recent commits (full weight).
// All commits are within 12 months of the reference date so weight = 1.0.
const referenceDate = new Date('2025-01-01T00:00:00Z');

// Generate author names
const arbAuthorName = fc.stringMatching(/^[A-Za-z]{2,8}$/);

// Generate a list of (author, commitCount) pairs
const arbAuthorCommits = fc.array(
  fc.record({
    author: arbAuthorName,
    count: fc.integer({ min: 1, max: 20 }),
  }),
  { minLength: 1, maxLength: 15 },
);

function buildCommits(authorCommits: { author: string; count: number }[]): CommitRecord[] {
  const commits: CommitRecord[] = [];
  let hashCounter = 0;

  for (const { author, count } of authorCommits) {
    for (let i = 0; i < count; i++) {
      const hash = hashCounter.toString(16).padStart(40, '0');
      hashCounter++;
      commits.push({
        hash,
        author,
        email: `${author.toLowerCase()}@test.com`,
        // All commits within 6 months of reference date → weight = 1.0
        date: new Date('2024-08-01T00:00:00Z'),
        message: `commit ${i}`,
        isMerge: false,
        parentHashes: [],
      });
    }
  }

  return commits;
}

describe('Property 10: Bus factor threshold correctness', () => {
  it('top N authors ≥ 50% of total, top N-1 < 50%', () => {
    fc.assert(
      fc.property(arbAuthorCommits, (authorCommitsList) => {
        // Deduplicate authors by name (last entry wins for count)
        const authorMap = new Map<string, number>();
        for (const { author, count } of authorCommitsList) {
          authorMap.set(author, (authorMap.get(author) ?? 0) + count);
        }

        // Build deduplicated list
        const deduped = Array.from(authorMap.entries()).map(([author, count]) => ({
          author,
          count,
        }));

        if (deduped.length === 0) return;

        const commits = buildCommits(deduped);
        const result = analyzeBusFactor(commits, [], referenceDate);

        const busFactor = result.overall.busFactor;
        const topAuthors = result.overall.topAuthors;

        // All commits have weight 1.0, so weighted commits = raw commit count
        const totalWeighted = topAuthors.reduce((sum, a) => sum + a.weightedCommits, 0);

        if (totalWeighted === 0) {
          expect(busFactor).toBe(0);
          return;
        }

        const threshold = totalWeighted * 0.5;

        // Top N authors should account for ≥ 50%
        let cumulativeN = 0;
        for (let i = 0; i < busFactor; i++) {
          cumulativeN += topAuthors[i].weightedCommits;
        }
        expect(cumulativeN).toBeGreaterThanOrEqual(threshold);

        // Top N-1 authors should account for < 50% (when N > 1)
        if (busFactor > 1) {
          let cumulativeNMinus1 = 0;
          for (let i = 0; i < busFactor - 1; i++) {
            cumulativeNMinus1 += topAuthors[i].weightedCommits;
          }
          expect(cumulativeNMinus1).toBeLessThan(threshold);
        }
      }),
      { numRuns: 100 },
    );
  });
});
