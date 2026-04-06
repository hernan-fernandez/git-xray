// Feature: gitpeek, Property 11: Time-decay weighting correctness
// For any commit age in months, the weight should be in [0.1, 1.0].
// age <= 12: weight = 1.0, age > 36: weight = 0.1,
// 12 < age <= 36: weight = 1.0 - 0.9 * (age - 12) / 24
// **Validates: Requirements 5.4**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { timeDecayWeight } from '../../src/utils/time-decay.js';

/**
 * Build a commit date that is approximately `ageMonths` months before `referenceDate`.
 * We subtract ageMonths worth of months from the reference date.
 */
function commitDateFromAge(ageMonths: number, referenceDate: Date): Date {
  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth();
  const refDay = referenceDate.getDate();

  const totalMonths = refYear * 12 + refMonth - Math.floor(ageMonths);
  const year = Math.floor(totalMonths / 12);
  const month = totalMonths % 12;

  // Use same day, clamped to valid range for the target month
  const maxDay = new Date(year, month + 1, 0).getDate();
  const day = Math.min(refDay, maxDay);

  return new Date(year, month, day);
}

describe('Property 11: Time-decay weighting correctness', () => {
  const referenceDate = new Date('2025-01-15T00:00:00Z');

  it('weight is always in [0.1, 1.0] for any commit date', () => {
    const arbReferenceDate = fc.date({
      min: new Date('2020-01-01T00:00:00Z'),
      max: new Date('2030-01-01T00:00:00Z'),
      noInvalidDate: true,
    });
    const arbCommitDate = fc.date({
      min: new Date('2015-01-01T00:00:00Z'),
      max: new Date('2030-01-01T00:00:00Z'),
      noInvalidDate: true,
    });

    fc.assert(
      fc.property(arbCommitDate, arbReferenceDate, (commitDate, refDate) => {
        // Only test when commit is before or at reference date
        if (commitDate.getTime() > refDate.getTime()) return;

        const weight = timeDecayWeight(commitDate, refDate);
        expect(weight).toBeGreaterThanOrEqual(0.1);
        expect(weight).toBeLessThanOrEqual(1.0);
      }),
      { numRuns: 100 },
    );
  });

  it('weight = 1.0 for age <= 12 months', () => {
    const arbAgeMonths = fc.double({ min: 0, max: 11.5, noNaN: true });

    fc.assert(
      fc.property(arbAgeMonths, (ageMonths) => {
        const commitDate = commitDateFromAge(ageMonths, referenceDate);
        const weight = timeDecayWeight(commitDate, referenceDate);
        expect(weight).toBe(1.0);
      }),
      { numRuns: 100 },
    );
  });

  it('weight = 0.1 for age > 36 months', () => {
    const arbAgeMonths = fc.double({ min: 37, max: 60, noNaN: true });

    fc.assert(
      fc.property(arbAgeMonths, (ageMonths) => {
        const commitDate = commitDateFromAge(ageMonths, referenceDate);
        const weight = timeDecayWeight(commitDate, referenceDate);
        expect(weight).toBe(0.1);
      }),
      { numRuns: 100 },
    );
  });

  it('weight follows piecewise linear formula for 12 < age <= 36', () => {
    // Use integer months to avoid floating-point edge cases with calendar math
    const arbAgeMonths = fc.integer({ min: 13, max: 36 });

    fc.assert(
      fc.property(arbAgeMonths, (ageMonths) => {
        const commitDate = commitDateFromAge(ageMonths, referenceDate);
        const weight = timeDecayWeight(commitDate, referenceDate);

        // Expected: 1.0 - 0.9 * (age - 12) / 24
        const expected = 1.0 - 0.9 * (ageMonths - 12) / 24;
        const clampedExpected = Math.max(0.1, expected);

        // Allow small tolerance for calendar-based age calculation
        expect(weight).toBeCloseTo(clampedExpected, 1);
        expect(weight).toBeGreaterThanOrEqual(0.1);
        expect(weight).toBeLessThanOrEqual(1.0);
      }),
      { numRuns: 100 },
    );
  });
});
