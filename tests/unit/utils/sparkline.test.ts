import { describe, it, expect } from 'vitest';
import { sparkline } from '../../../src/utils/sparkline.js';

describe('sparkline', () => {
  it('returns empty string for empty array', () => {
    expect(sparkline([])).toBe('');
  });

  it('returns █ for single value', () => {
    expect(sparkline([42])).toBe('█');
  });

  it('returns all ▄ for identical values', () => {
    expect(sparkline([5, 5, 5, 5])).toBe('▄▄▄▄');
  });

  it('maps min to ▁ and max to █', () => {
    const result = sparkline([0, 100]);
    expect(result[0]).toBe('▁');
    expect(result[1]).toBe('█');
  });

  it('produces correct mapping for known ascending input', () => {
    // Values 0..7 should map roughly to the 8 block characters
    const result = sparkline([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(result).toBe('▁▂▃▄▅▆▇█');
  });

  it('handles two identical values', () => {
    expect(sparkline([10, 10])).toBe('▄▄');
  });

  it('handles negative values', () => {
    const result = sparkline([-10, 0, 10]);
    expect(result[0]).toBe('▁');
    expect(result[2]).toBe('█');
  });

  it('returns string of same length as input', () => {
    const input = [1, 2, 3, 4, 5];
    expect(sparkline(input).length).toBe(input.length);
  });
});
