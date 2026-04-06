/**
 * Calculate the age in months between a commit date and a reference date.
 * Uses calendar month difference (year * 12 + month delta) for consistency.
 */
export declare function getAgeInMonths(commitDate: Date, referenceDate: Date): number;
/**
 * Return the time-decay weight for a commit given its date and a reference date.
 *
 * - 1.0 if age <= 12 months
 * - 0.1 if age > 36 months
 * - Linearly interpolated between 1.0 and 0.1 for ages in (12, 36]
 *
 * The reference date is typically the `--until` date or the current system time.
 */
export declare function timeDecayWeight(commitDate: Date, referenceDate: Date): number;
//# sourceMappingURL=time-decay.d.ts.map