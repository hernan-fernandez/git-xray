// Time-decay weighting function for bus factor calculation
// Weight model:
//   age <= 12 months: 1.0
//   age > 36 months:  0.1
//   else:             1.0 - 0.9 * (age - 12) / 24  (linear interpolation)

/**
 * Calculate the age in months between a commit date and a reference date.
 * Uses calendar month difference (year * 12 + month delta) for consistency.
 */
export function getAgeInMonths(commitDate: Date, referenceDate: Date): number {
  const yearDiff = referenceDate.getFullYear() - commitDate.getFullYear();
  const monthDiff = referenceDate.getMonth() - commitDate.getMonth();
  const dayFraction =
    (referenceDate.getDate() - commitDate.getDate()) /
    daysInMonth(referenceDate.getFullYear(), referenceDate.getMonth());

  return yearDiff * 12 + monthDiff + dayFraction;
}

/**
 * Return the time-decay weight for a commit given its date and a reference date.
 *
 * - 1.0 if age <= 12 months
 * - 0.1 if age > 36 months
 * - Linearly interpolated between 1.0 and 0.1 for ages in (12, 36]
 *
 * The reference date is typically the `--until` date or the current system time.
 */
export function timeDecayWeight(commitDate: Date, referenceDate: Date): number {
  const age = getAgeInMonths(commitDate, referenceDate);

  if (age <= 12) return 1.0;
  if (age > 36) return 0.1;

  return Math.max(0.1, 1.0 - 0.9 * (age - 12) / 24);
}

function daysInMonth(year: number, month: number): number {
  // month is 0-indexed; day 0 of next month = last day of current month
  return new Date(year, month + 1, 0).getDate();
}
