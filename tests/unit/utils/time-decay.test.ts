import { describe, it, expect } from 'vitest';
import { timeDecayWeight, getAgeInMonths } from '../../../src/utils/time-decay.js';

describe('getAgeInMonths', () => {
  it('returns 0 for same date', () => {
    const d = new Date('2024-06-15T00:00:00Z');
    expect(getAgeInMonths(d, d)).toBeCloseTo(0, 1);
  });

  it('returns 12 for exactly 12 months apart', () => {
    const commit = new Date('2023-01-15T00:00:00Z');
    const ref = new Date('2024-01-15T00:00:00Z');
    expect(getAgeInMonths(commit, ref)).toBeCloseTo(12, 1);
  });

  it('returns 36 for exactly 36 months apart', () => {
    const commit = new Date('2021-03-10T00:00:00Z');
    const ref = new Date('2024-03-10T00:00:00Z');
    expect(getAgeInMonths(commit, ref)).toBeCloseTo(36, 1);
  });

  it('calculates age relative to --until date, not current time', () => {
    const commit = new Date('2020-06-01T00:00:00Z');
    const untilDate = new Date('2021-06-01T00:00:00Z');
    expect(getAgeInMonths(commit, untilDate)).toBeCloseTo(12, 1);
  });
});

describe('timeDecayWeight', () => {
  it('returns 1.0 for age = 0 months', () => {
    const ref = new Date('2024-06-15T00:00:00Z');
    expect(timeDecayWeight(ref, ref)).toBe(1.0);
  });

  it('returns 1.0 for age exactly 12 months', () => {
    const commit = new Date('2023-06-15T00:00:00Z');
    const ref = new Date('2024-06-15T00:00:00Z');
    expect(timeDecayWeight(commit, ref)).toBeCloseTo(1.0, 2);
  });

  it('returns 0.1 for age exactly 36 months', () => {
    const commit = new Date('2021-06-15T00:00:00Z');
    const ref = new Date('2024-06-15T00:00:00Z');
    expect(timeDecayWeight(commit, ref)).toBeCloseTo(0.1, 2);
  });

  it('returns 0.1 for age > 36 months (e.g. 48 months)', () => {
    const commit = new Date('2020-06-15T00:00:00Z');
    const ref = new Date('2024-06-15T00:00:00Z');
    expect(timeDecayWeight(commit, ref)).toBe(0.1);
  });

  it('returns midpoint ~0.55 for age = 24 months', () => {
    const commit = new Date('2022-06-15T00:00:00Z');
    const ref = new Date('2024-06-15T00:00:00Z');
    // 1.0 - 0.9 * (24 - 12) / 24 = 1.0 - 0.9 * 0.5 = 0.55
    expect(timeDecayWeight(commit, ref)).toBeCloseTo(0.55, 2);
  });

  it('weight is always in range [0.1, 1.0]', () => {
    const ref = new Date('2024-06-15T00:00:00Z');
    // Test a range of ages
    for (let monthsBack = 0; monthsBack <= 60; monthsBack += 3) {
      const commit = new Date(ref);
      commit.setMonth(commit.getMonth() - monthsBack);
      const w = timeDecayWeight(commit, ref);
      expect(w).toBeGreaterThanOrEqual(0.1);
      expect(w).toBeLessThanOrEqual(1.0);
    }
  });

  it('uses --until date as reference, not current time', () => {
    // Commit is 6 months before the --until date → should get full weight
    const commit = new Date('2022-01-01T00:00:00Z');
    const untilDate = new Date('2022-07-01T00:00:00Z');
    expect(timeDecayWeight(commit, untilDate)).toBeCloseTo(1.0, 2);

    // Same commit relative to a much later date → should get low weight
    const laterDate = new Date('2026-01-01T00:00:00Z');
    expect(timeDecayWeight(commit, laterDate)).toBe(0.1);
  });
});
