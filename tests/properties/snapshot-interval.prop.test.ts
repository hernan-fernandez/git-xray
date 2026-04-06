// Feature: gitpeek, Property 7: Complexity snapshot interval correctness
// For any date range, determineInterval returns 'monthly' for ≥3 months,
// 'weekly' for <3 months. And generateSnapshotDates produces dates with
// appropriate spacing.
// **Validates: Requirements 4.1, 4.3**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { determineInterval, generateSnapshotDates } from '../../src/analyzers/complexity.js';

const THREE_MONTHS_MS = 3 * 30 * 24 * 60 * 60 * 1000; // ~90 days
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const ONE_MONTH_APPROX_MS = 32 * 24 * 60 * 60 * 1000; // generous upper bound for monthly spacing

// Generate a start date and a positive duration to derive the end date
const arbDateRange = fc
  .tuple(
    fc.date({ min: new Date('2018-01-01T00:00:00Z'), max: new Date('2024-01-01T00:00:00Z'), noInvalidDate: true }),
    fc.integer({ min: 1, max: 365 * 4 }), // duration in days (1 day to ~4 years)
  )
  .map(([from, days]) => {
    const to = new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
    return { from, to };
  });

describe('Property 7: Complexity snapshot interval correctness', () => {
  it('determineInterval returns monthly for ≥3 months, weekly for <3 months', () => {
    fc.assert(
      fc.property(arbDateRange, ({ from, to }) => {
        const rangeMs = to.getTime() - from.getTime();
        const interval = determineInterval(from, to);

        if (rangeMs >= THREE_MONTHS_MS) {
          expect(interval).toBe('monthly');
        } else {
          expect(interval).toBe('weekly');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('generateSnapshotDates produces dates with appropriate spacing', () => {
    fc.assert(
      fc.property(arbDateRange, ({ from, to }) => {
        const interval = determineInterval(from, to);
        const dates = generateSnapshotDates(from, to, interval);

        // Should produce at least one date
        expect(dates.length).toBeGreaterThanOrEqual(1);

        // All dates should be within [from, to] range (inclusive)
        for (const d of dates) {
          expect(d.getTime()).toBeGreaterThanOrEqual(from.getTime());
          expect(d.getTime()).toBeLessThanOrEqual(to.getTime());
        }

        // Last date should be near the end of the range
        const lastDate = dates[dates.length - 1];
        expect(lastDate.getTime()).toBe(to.getTime());

        // Check spacing between consecutive dates
        if (dates.length >= 2) {
          for (let i = 1; i < dates.length; i++) {
            const gap = dates[i].getTime() - dates[i - 1].getTime();
            expect(gap).toBeGreaterThan(0); // strictly increasing

            // For non-final gaps, check appropriate spacing
            if (i < dates.length - 1) {
              if (interval === 'weekly') {
                // Weekly gaps should be ~7 days
                expect(gap).toBeLessThanOrEqual(ONE_WEEK_MS + 1000);
              } else {
                // Monthly gaps should be ≤ ~32 days
                expect(gap).toBeLessThanOrEqual(ONE_MONTH_APPROX_MS);
              }
            }
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
