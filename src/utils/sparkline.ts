// Unicode sparkline generation
// Maps numeric arrays to Unicode block characters (▁▂▃▄▅▆▇█)

const BLOCKS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const;

/**
 * Generate a Unicode sparkline string from a numeric array.
 *
 * - Empty array → empty string
 * - Single value → █
 * - All same values → ▄ (middle character)
 * - Otherwise, scales values linearly between min and max,
 *   mapping each to one of 8 block characters.
 */
export function sparkline(values: number[]): string {
  if (values.length === 0) return '';
  if (values.length === 1) return BLOCKS[7]; // █

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    // All same values → middle character (index 3 = ▄)
    return BLOCKS[3].repeat(values.length);
  }

  const range = max - min;

  return values
    .map((v) => {
      // Normalize to [0, 1]
      const normalized = (v - min) / range;
      // Map to block index [0, 7]
      const index = Math.min(Math.round(normalized * 7), 7);
      return BLOCKS[index];
    })
    .join('');
}
