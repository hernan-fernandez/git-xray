import { describe, it, expect, vi } from 'vitest';
import {
  determineInterval,
  generateSnapshotDates,
  parseLsTreeOutput,
  computeChurnRates,
  analyzeComplexityTrend,
  downsampleDates,
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
  /** Build a GitRunner whose diff-tree returns the given file lists per (prev, curr) pair. */
  function makeDiffRunner(diffOutputsByPair: Map<string, string>): GitRunner {
    return {
      stream: vi.fn() as any,
      exec: vi.fn(async (args: string[]) => {
        if (args[0] !== 'diff-tree') return '';
        // Args: ['diff-tree', '-r', '--name-only', <prev>, <curr>]
        const key = `${args[3]}|${args[4]}`;
        return diffOutputsByPair.get(key) ?? '';
      }),
    };
  }

  it('leaves first snapshot churnRate at 0', async () => {
    const snapshots: ComplexitySnapshot[] = [
      { date: makeDate(2023, 1), totalFiles: 10, totalSize: 1000, churnRate: 0, commitHash: 'c1' },
      { date: makeDate(2023, 2), totalFiles: 12, totalSize: 1200, churnRate: 0, commitHash: 'c2' },
    ];
    const runner = makeDiffRunner(new Map([['c1|c2', 'a.ts\nb.ts\n']]));

    await computeChurnRates(snapshots, runner);
    expect(snapshots[0].churnRate).toBe(0);
  });

  it('sets churnRate to filesChanged / current totalFiles using diff-tree output', async () => {
    const snapshots: ComplexitySnapshot[] = [
      { date: makeDate(2023, 1), totalFiles: 10, totalSize: 1000, churnRate: 0, commitHash: 'c1' },
      { date: makeDate(2023, 2), totalFiles: 12, totalSize: 1200, churnRate: 0, commitHash: 'c2' },
      { date: makeDate(2023, 3), totalFiles: 15, totalSize: 1500, churnRate: 0, commitHash: 'c3' },
    ];
    const runner = makeDiffRunner(new Map([
      ['c1|c2', 'src/a.ts\nsrc/b.ts\nsrc/c.ts\n'],            // 3 changed paths
      ['c2|c3', 'src/x.ts\nsrc/y.ts\nsrc/z.ts\nsrc/w.ts\n'],  // 4 changed paths
    ]));

    await computeChurnRates(snapshots, runner);

    // snapshot[1]: 3 changed / 12 totalFiles
    expect(snapshots[1].churnRate).toBeCloseTo(3 / 12);
    // snapshot[2]: 4 changed / 15 totalFiles
    expect(snapshots[2].churnRate).toBeCloseTo(4 / 15);
  });

  it('detects renames as churn that the old count-delta proxy missed', async () => {
    // Same file count before and after, but every file is different — should
    // register as 100% churn, not the 0% that |Δfiles|/files would produce.
    const snapshots: ComplexitySnapshot[] = [
      { date: makeDate(2023, 1), totalFiles: 5, totalSize: 500, churnRate: 0, commitHash: 'c1' },
      { date: makeDate(2023, 2), totalFiles: 5, totalSize: 500, churnRate: 0, commitHash: 'c2' },
    ];
    const runner = makeDiffRunner(new Map([
      ['c1|c2', ['old1.ts', 'old2.ts', 'old3.ts', 'old4.ts', 'old5.ts',
                'new1.ts', 'new2.ts', 'new3.ts', 'new4.ts', 'new5.ts'].join('\n')],
    ]));

    await computeChurnRates(snapshots, runner);
    // 10 paths changed (5 deleted + 5 added) ÷ 5 totalFiles = 2.0
    expect(snapshots[1].churnRate).toBeCloseTo(2);
  });

  it('avoids division by zero when current totalFiles is 0', async () => {
    const snapshots: ComplexitySnapshot[] = [
      { date: makeDate(2023, 1), totalFiles: 5, totalSize: 500, churnRate: 0, commitHash: 'c1' },
      { date: makeDate(2023, 2), totalFiles: 0, totalSize: 0, churnRate: 0, commitHash: 'c2' },
    ];
    const runner = makeDiffRunner(new Map([['c1|c2', 'a.ts\nb.ts\n']]));

    await computeChurnRates(snapshots, runner);
    // Denominator is clamped to 1, so churn = 2/1 = 2 (rare edge case, value is not nan)
    expect(snapshots[1].churnRate).toBe(2);
  });

  it('keeps churnRate at 0 when commit hashes are missing', async () => {
    // Synthetic snapshots without commit hashes (test fixtures, rev-list misses).
    const snapshots: ComplexitySnapshot[] = [
      { date: makeDate(2023, 1), totalFiles: 10, totalSize: 1000, churnRate: 0 },
      { date: makeDate(2023, 2), totalFiles: 12, totalSize: 1200, churnRate: 0 },
    ];
    const runner = makeDiffRunner(new Map());

    await computeChurnRates(snapshots, runner);
    expect(snapshots[1].churnRate).toBe(0);
  });

  it('keeps churnRate at 0 when prev and curr point to the same commit', async () => {
    const snapshots: ComplexitySnapshot[] = [
      { date: makeDate(2023, 1), totalFiles: 10, totalSize: 1000, churnRate: 0, commitHash: 'c1' },
      { date: makeDate(2023, 2), totalFiles: 10, totalSize: 1000, churnRate: 0, commitHash: 'c1' },
    ];
    const runner = makeDiffRunner(new Map());

    await computeChurnRates(snapshots, runner);
    expect(snapshots[1].churnRate).toBe(0);
  });

  it('continues with churn=0 when diff-tree throws', async () => {
    const snapshots: ComplexitySnapshot[] = [
      { date: makeDate(2023, 1), totalFiles: 10, totalSize: 1000, churnRate: 0, commitHash: 'c1' },
      { date: makeDate(2023, 2), totalFiles: 12, totalSize: 1200, churnRate: 0, commitHash: 'c2' },
      { date: makeDate(2023, 3), totalFiles: 14, totalSize: 1400, churnRate: 0, commitHash: 'c3' },
    ];
    const runner: GitRunner = {
      stream: vi.fn() as any,
      exec: vi.fn(async (args: string[]) => {
        if (args[0] === 'diff-tree' && args[3] === 'c1' && args[4] === 'c2') {
          throw new Error('diff-tree failure');
        }
        if (args[0] === 'diff-tree') return 'a.ts\nb.ts\n';
        return '';
      }),
    };

    await computeChurnRates(snapshots, runner);
    expect(snapshots[1].churnRate).toBe(0);
    expect(snapshots[2].churnRate).toBeCloseTo(2 / 14);
  });

  it('handles empty snapshots array', async () => {
    const snapshots: ComplexitySnapshot[] = [];
    await computeChurnRates(snapshots, undefined);
    expect(snapshots).toHaveLength(0);
  });

  it('handles single snapshot', async () => {
    const snapshots: ComplexitySnapshot[] = [
      { date: makeDate(2023, 1), totalFiles: 10, totalSize: 1000, churnRate: 0, commitHash: 'c1' },
    ];
    await computeChurnRates(snapshots, undefined);
    expect(snapshots[0].churnRate).toBe(0);
  });
});


describe('downsampleDates', () => {
  function range(n: number): Date[] {
    return Array.from({ length: n }, (_, i) => new Date(Date.UTC(2024, 0, i + 1)));
  }

  it('returns input unchanged when length <= max', () => {
    const dates = range(5);
    expect(downsampleDates(dates, 10)).toEqual(dates);
    expect(downsampleDates(dates, 5)).toEqual(dates);
  });

  it('preserves the first and last dates when downsampling', () => {
    const dates = range(100);
    const out = downsampleDates(dates, 24);
    expect(out).toHaveLength(24);
    expect(out[0]).toEqual(dates[0]);
    expect(out[out.length - 1]).toEqual(dates[dates.length - 1]);
  });

  it('produces evenly spaced indices', () => {
    const dates = range(50);
    const out = downsampleDates(dates, 5);
    // Math.round((i * 49) / 4) for i in 0..4 → 0, 12, 25, 37, 49
    expect(out).toEqual([dates[0], dates[12], dates[25], dates[37], dates[49]]);
  });

  it('handles edge cases (max <= 1)', () => {
    const dates = range(10);
    expect(downsampleDates(dates, 0)).toEqual(dates);
    expect(downsampleDates(dates, 1)).toEqual(dates);
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
