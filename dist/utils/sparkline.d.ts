/**
 * Generate a Unicode sparkline string from a numeric array.
 *
 * - Empty array → empty string
 * - Single value → █
 * - All same values → ▄ (middle character)
 * - Otherwise, scales values linearly between min and max,
 *   mapping each to one of 8 block characters.
 */
export declare function sparkline(values: number[]): string;
//# sourceMappingURL=sparkline.d.ts.map