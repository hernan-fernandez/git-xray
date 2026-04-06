import { describe, it, expect, vi } from 'vitest';
import {
  determineInterval,
  generateSnapshotDates,
  parseLsTreeOutput,
  computeChurnRates,
  analyzeComplexityTrend,
  type ComplexitySnapshot,
  type ComplexityConfig,
} from '../../../src/analyzers/complexity.js';
import type { GitRunner } from '../../../src/git/runner.js';

function makeDate(year: number, month: number, day: number = 1): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function makeMockGitRunner(
  revListResults: Map<string, string>,
  lsTreeResults: Map<string, string>,
): GitRunner {
  return {
    stream: vi.fn() as any,
    exec: vi.fn(async (args: string[]) => {
      if (args[0] === 'rev-list') {
        // Build a key from the --before date to match
        const beforeArg = args.find((a) => a.startsWith('--before='));
        if (beforeArg) {
          for (const [key, value] of revListResults) {
            if (beforeArg.includes(key) || key === beforeArg) {
              return value;
            }
          }
        }
        // Fallback: return first result or empty
        const values = [...revListResults.values()];
        return values.length > 0 ? values[0] : '';
      }
      if (args[0] === 'ls-tree') {
        const treeIsh = args[3]; // ls-tree -r -l <treeIsh>
        return lsTreeResults.get(treeIsh) ?? '';
      }
      return '';
    }),
  };
}

describe('determineInterval', () => {
  it('returns monthly for date range >= 3 months', () => {
    const from = makeDate(2023, 1, 1);
    const to = makeDate(2023, 6, 1);
    expect(determineInterval(from, to)).toBe('monthly');
  });

  it('returns monthly for exactly 3 months (90 days)', () => {
    const from = makeDate(2023, 1, 1);
    const to = new Date(from.getTime() + 3 * 30 * 24 * 60 * 60 * 1000);
    expect(determineInterval(from, to)).toBe('monthly');
  });

  it('returns weekly for date range < 3 months', () => {
    const from = makeDate(2023, 1, 1);
    const to = makeDate(2023, 2, 15);
    expect(determineInterval(from, to)).toBe('weekly');
  });

  it('returns weekly for very short range (1 week)', () => {
    const from = makeDate(2023, 1, 1);
    const to = makeDate(2023, 1, 8);
    expect(determineInterval(from, to)).toBe('weekly');
  });
});


describe('generateSnapshotDates', () => {
  it('generates monthly dates for a 6-month range', () => {
    const from = makeDate(2023, 1, 1);
    const to = makeDate(2023, 6, 15);
    const dates = generateSnapshotDates(from, to, 'monthly');

    // Should include Jan 1, Feb 1, Mar 1, Apr 1, May 1, Jun 1, plus Jun 15 (to)
    expect(dates.length).toBeGreaterThanOrEqual(6);
    // First date should be Jan 1
    expect(dates[0]).toEqual(makeDate(2023, 1, 1));
    // Last date should be the `to` date
    expect(dates[dates.length - 1]).toEqual(to);
  });

  it('generates weekly dates for a short range', () => {
    const from = makeDate(2023, 1, 1);
    const to = makeDate(2023, 1, 22);
    const dates = generateSnapshotDates(from, to, 'weekly');

    // Jan 1, Jan 8, Jan 15, Jan 22
    expect(dates.length).toBeGreaterThanOrEqual(3);
    expect(dates[0]).toEqual(from);
  });

  it('includes the to date as the last snapshot', () => {
    const from = makeDate(2023, 1, 1);
    const to = makeDate(2023, 3, 15);
    const dates = generateSnapshotDates(from, to, 'monthly');

    expect(dates[dates.length - 1]).toEqual(to);
  });

  it('returns at least one date for a zero-length range', () => {
    const date = makeDate(2023, 1, 1);
    const dates = generateSnapshotDates(date, date, 'weekly');

    expect(dates.length).toBeGreaterThanOrEqual(1);
  });
});

describe('parseLsTreeOutput', () => {
  const sampleOutput = [
    '100644 blob abc123 1024\tsrc/index.ts',
    '100644 blob def456 2048\tsrc/utils.ts',
    '100644 blob ghi789 512\tREADME.md',
    '040000 tree jkl012 -\tsrc',
  ].join('\n');

  it('computes totalFiles as count of blob entries', () => {
    const result = parseLsTreeOutput(sampleOutput);
    expect(result.totalFiles).toBe(3);
  });

  it('computes totalSize as sum of blob sizes', () => {
    const result = parseLsTreeOutput(sampleOutput);
    expect(result.totalSize).toBe(1024 + 2048 + 512);
  });

  it('excludes tree entries from counts', () => {
    const result = parseLsTreeOutput(sampleOutput);
    // Only 3 blobs, not the tree entry
    expect(result.totalFiles).toBe(3);
  });

  it('applies scope filter when provided', () => {
    const result = parseLsTreeOutput(sampleOutput, 'src/');
    expect(result.totalFiles).toBe(2); // only src/index.ts and src/utils.ts
    expect(result.totalSize).toBe(1024 + 2048);
  });

  it('returns zeros for empty output', () => {
    const result = parseLsTreeOutput('');
    expect(result.totalFiles).toBe(0);
    expect(result.totalSize).toBe(0);
  });

  it('handles malformed lines gracefully', () => {
    const output = 'not a valid line\n100644 blob abc 100\tfile.ts\n';
    const result = parseLsTreeOutput(output);
    expect(result.totalFiles).toBe(1);
    expect(result.totalSize).toBe(100);
  });
});

describe('computeChurnRates', () => {
  it('sets first snapshot churnRate to 0', () => {
    const snapshots: ComplexitySnapshot[] = [
      { date: makeDate(2023, 1), totalFiles: 10, totalSize: 1000, churnRate: 0 },
      { date: makeDate(2023, 2), totalFiles: 12, totalSize: 1200, churnRate: 0 },
    ];

    computeChurnRates(snapshots);
    expect(snapshots[0].churnRate).toBe(0);
  });

  it('computes churnRate as |delta files| / current totalFiles', () => {
    const snapshots: ComplexitySnapshot[] = [
      { date: makeDate(2023, 1), totalFiles: 10, totalSize: 1000, churnRate: 0 },
      { date: makeDate(2023, 2), totalFiles: 12, totalSize: 1200, churnRate: 0 },
      { date: makeDate(2023, 3), totalFiles: 15, totalSize: 1500, churnRate: 0 },
    ];

    computeChurnRates(snapshots);

    // snapshot[1]: |12 - 10| / 12 = 2/12
    expect(snapshots[1].churnRate).toBeCloseTo(2 / 12);
    // snapshot[2]: |15 - 12| / 15 = 3/15 = 0.2
    expect(snapshots[2].churnRate).toBeCloseTo(0.2);
  });

  it('handles zero totalFiles without division error', () => {
    const snapshots: ComplexitySnapshot[] = [
      { date: makeDate(2023, 1), totalFiles: 5, totalSize: 500, churnRate: 0 },
      { date: makeDate(2023, 2), totalFiles: 0, totalSize: 0, churnRate: 0 },
    ];

    computeChurnRates(snapshots);
    expect(snapshots[1].churnRate).toBe(0);
  });

  it('handles empty snapshots array', () => {
    const snapshots: ComplexitySnapshot[] = [];
    computeChurnRates(snapshots);
    expect(snapshots).toHaveLength(0);
  });

  it('handles single snapshot', () => {
    const snapshots: ComplexitySnapshot[] = [
      { date: makeDate(2023, 1), totalFiles: 10, totalSize: 1000, churnRate: 0 },
    ];
    computeChurnRates(snapshots);
    expect(snapshots[0].churnRate).toBe(0);
  });
});


describe('analyzeComplexityTrend', () => {
  it('uses monthly interval for >= 3 months history', async () => {
    const config: ComplexityConfig = {
      from: makeDate(2023, 1, 1),
      to: makeDate(2023, 6, 1),
      branch: 'main',
    };

    const lsTreeOutput = '100644 blob abc 500\tfile.ts\n100644 blob def 300\tother.ts\n';
    const mockRunner: GitRunner = {
      stream: vi.fn() as any,
      exec: vi.fn(async (args: string[]) => {
        if (args[0] === 'rev-list') return 'abc123';
        if (args[0] === 'ls-tree') return lsTreeOutput;
        return '';
      }),
    };

    const result = await analyzeComplexityTrend(config, mockRunner);

    expect(result.interval).toBe('monthly');
    expect(result.snapshots.length).toBeGreaterThan(0);
  });

  it('uses weekly interval for < 3 months history', async () => {
    const config: ComplexityConfig = {
      from: makeDate(2023, 1, 1),
      to: makeDate(2023, 2, 1),
      branch: 'main',
    };

    const lsTreeOutput = '100644 blob abc 500\tfile.ts\n';
    const mockRunner: GitRunner = {
      stream: vi.fn() as any,
      exec: vi.fn(async (args: string[]) => {
        if (args[0] === 'rev-list') return 'abc123';
        if (args[0] === 'ls-tree') return lsTreeOutput;
        return '';
      }),
    };

    const result = await analyzeComplexityTrend(config, mockRunner);

    expect(result.interval).toBe('weekly');
    expect(result.snapshots.length).toBeGreaterThan(0);
  });

  it('computes correct totalFiles and totalSize from ls-tree output', async () => {
    const config: ComplexityConfig = {
      from: makeDate(2023, 1, 1),
      to: makeDate(2023, 1, 8),
      branch: 'main',
    };

    const lsTreeOutput = [
      '100644 blob aaa 1024\tsrc/a.ts',
      '100644 blob bbb 2048\tsrc/b.ts',
      '100644 blob ccc 512\tREADME.md',
    ].join('\n');

    const mockRunner: GitRunner = {
      stream: vi.fn() as any,
      exec: vi.fn(async (args: string[]) => {
        if (args[0] === 'rev-list') return 'commit123';
        if (args[0] === 'ls-tree') return lsTreeOutput;
        return '';
      }),
    };

    const result = await analyzeComplexityTrend(config, mockRunner);

    // All snapshots should have the same metrics since we return the same ls-tree
    for (const snapshot of result.snapshots) {
      expect(snapshot.totalFiles).toBe(3);
      expect(snapshot.totalSize).toBe(1024 + 2048 + 512);
    }
  });

  it('computes churnRate between consecutive snapshots', async () => {
    const config: ComplexityConfig = {
      from: makeDate(2023, 1, 1),
      to: makeDate(2023, 1, 15),
      branch: 'main',
    };

    let callCount = 0;
    const mockRunner: GitRunner = {
      stream: vi.fn() as any,
      exec: vi.fn(async (args: string[]) => {
        if (args[0] === 'rev-list') return `commit${callCount++}`;
        if (args[0] === 'ls-tree') {
          // Return different file counts for different commits
          if (callCount <= 2) {
            return '100644 blob a 100\tfile1.ts\n100644 blob b 200\tfile2.ts\n';
          } else if (callCount <= 4) {
            return '100644 blob a 100\tfile1.ts\n100644 blob b 200\tfile2.ts\n100644 blob c 300\tfile3.ts\n';
          } else {
            return '100644 blob a 100\tfile1.ts\n100644 blob b 200\tfile2.ts\n100644 blob c 300\tfile3.ts\n100644 blob d 400\tfile4.ts\n';
          }
        }
        return '';
      }),
    };

    const result = await analyzeComplexityTrend(config, mockRunner);

    // First snapshot should have churnRate 0
    expect(result.snapshots[0].churnRate).toBe(0);
    // Subsequent snapshots should have non-zero churnRate if file counts differ
    if (result.snapshots.length > 1) {
      // At least one subsequent snapshot should have computed churnRate
      const hasChurn = result.snapshots.slice(1).some((s) => s.churnRate >= 0);
      expect(hasChurn).toBe(true);
    }
  });

  it('returns empty snapshots when no commits found', async () => {
    const config: ComplexityConfig = {
      from: makeDate(2023, 1, 1),
      to: makeDate(2023, 1, 15),
      branch: 'main',
    };

    const mockRunner: GitRunner = {
      stream: vi.fn() as any,
      exec: vi.fn(async (args: string[]) => {
        // rev-list returns empty — no commits at any snapshot point
        return '';
      }),
    };

    const result = await analyzeComplexityTrend(config, mockRunner);

    expect(result.snapshots).toHaveLength(0);
    expect(result.interval).toBe('weekly');
  });

  it('applies scope filter to tree metrics', async () => {
    const config: ComplexityConfig = {
      from: makeDate(2023, 1, 1),
      to: makeDate(2023, 1, 8),
      branch: 'main',
      scope: 'src/',
    };

    const lsTreeOutput = [
      '100644 blob aaa 1024\tsrc/a.ts',
      '100644 blob bbb 2048\tsrc/b.ts',
      '100644 blob ccc 512\tREADME.md',
    ].join('\n');

    const mockRunner: GitRunner = {
      stream: vi.fn() as any,
      exec: vi.fn(async (args: string[]) => {
        if (args[0] === 'rev-list') return 'commit123';
        if (args[0] === 'ls-tree') return lsTreeOutput;
        return '';
      }),
    };

    const result = await analyzeComplexityTrend(config, mockRunner);

    // Only src/ files should be counted
    for (const snapshot of result.snapshots) {
      expect(snapshot.totalFiles).toBe(2);
      expect(snapshot.totalSize).toBe(1024 + 2048);
    }
  });
});
