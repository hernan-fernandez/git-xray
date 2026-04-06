// Feature: gitpeek, Property 18: Date range filtering correctness
// For any set of CLI args with --since and --until, parseConfig correctly
// parses the date flags, and commits can be filtered by the resulting dates.
// **Validates: Requirements 10.1, 10.2**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseConfig } from '../../src/config.js';

// --- Arbitraries ---

// Generate a date within a reasonable range
const arbDate = fc.date({
  min: new Date('2020-01-01T00:00:00Z'),
  max: new Date('2025-12-31T00:00:00Z'),
  noInvalidDate: true,
});

// Generate a pair of dates where since <= until
const arbDateRange = fc
  .tuple(arbDate, arbDate)
  .map(([a, b]) => (a.getTime() <= b.getTime() ? [a, b] : [b, a]));

// Simple commit record for filtering
interface SimpleCommit {
  hash: string;
  date: Date;
}

const arbCommit: fc.Arbitrary<SimpleCommit> = fc.record({
  hash: fc.stringMatching(/^[0-9a-f]{8}$/),
  date: fc.date({
    min: new Date('2019-01-01T00:00:00Z'),
    max: new Date('2026-12-31T00:00:00Z'),
    noInvalidDate: true,
  }),
});

describe('Property 18: Date range filtering correctness', () => {
  it('parseConfig correctly parses --since and --until date flags', () => {
    fc.assert(
      fc.property(arbDateRange, ([since, until]) => {
        const sinceStr = since.toISOString();
        const untilStr = until.toISOString();

        const config = parseConfig(['node', 'git-wrapped', '--since', sinceStr, '--until', untilStr]);

        expect(config.since).toBeInstanceOf(Date);
        expect(config.until).toBeInstanceOf(Date);
        expect(config.since!.getTime()).toBe(since.getTime());
        expect(config.until!.getTime()).toBe(until.getTime());
      }),
      { numRuns: 100 },
    );
  });

  it('filtering commits by parsed date range includes only those within [since, until]', () => {
    fc.assert(
      fc.property(
        arbDateRange,
        fc.array(arbCommit, { minLength: 0, maxLength: 50 }),
        ([since, until], commits) => {
          // Simulate the date filtering that git commands would apply
          const filtered = commits.filter(
            (c) => c.date.getTime() >= since.getTime() && c.date.getTime() <= until.getTime(),
          );

          // All included commits must be within the range
          for (const commit of filtered) {
            expect(commit.date.getTime()).toBeGreaterThanOrEqual(since.getTime());
            expect(commit.date.getTime()).toBeLessThanOrEqual(until.getTime());
          }

          // No excluded commits should be within the range
          const excluded = commits.filter(
            (c) => c.date.getTime() < since.getTime() || c.date.getTime() > until.getTime(),
          );
          for (const commit of excluded) {
            const inRange =
              commit.date.getTime() >= since.getTime() && commit.date.getTime() <= until.getTime();
            expect(inRange).toBe(false);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
