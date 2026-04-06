import { describe, it, expect, vi } from 'vitest';
import {
  analyzeHotspots,
  computeChangeFrequencies,
  type NameStatusCommit,
  type HotspotConfig,
} from '../../../src/analyzers/hotspots.js';
import type { GitRunner } from '../../../src/git/runner.js';
import type { CommandFilters } from '../../../src/git/commands.js';

function makeCommit(hash: string, files: { status: string; filePath: string }[]): NameStatusCommit {
  return { commitHash: hash, files };
}

function makeMockGitRunner(followOutputs: Map<string, string>): GitRunner {
  return {
    stream: vi.fn() as any,
    exec: vi.fn(async (args: string[]) => {
      // Extract the file path from args (last element after --)
      const dashDashIdx = args.indexOf('--');
      const filePath = dashDashIdx >= 0 ? args[dashDashIdx + 1] : '';
      return followOutputs.get(filePath) ?? '';
    }),
  };
}

const defaultFilters: CommandFilters = {};

describe('computeChangeFrequencies', () => {
  it('counts distinct commits per file', () => {
    const commits: NameStatusCommit[] = [
      makeCommit('aaa', [
        { status: 'M', filePath: 'src/a.ts' },
        { status: 'M', filePath: 'src/b.ts' },
      ]),
      makeCommit('bbb', [
        { status: 'M', filePath: 'src/a.ts' },
        { status: 'A', filePath: 'src/c.ts' },
      ]),
      makeCommit('ccc', [
        { status: 'M', filePath: 'src/a.ts' },
      ]),
    ];

    const result = computeChangeFrequencies(commits);

    expect(result.get('src/a.ts')?.changeCount).toBe(3);
    expect(result.get('src/b.ts')?.changeCount).toBe(1);
    expect(result.get('src/c.ts')?.changeCount).toBe(1);
  });

  it('deduplicates files within a single commit', () => {
    const commits: NameStatusCommit[] = [
      makeCommit('aaa', [
        { status: 'M', filePath: 'src/a.ts' },
        { status: 'M', filePath: 'src/a.ts' },
      ]),
    ];

    const result = computeChangeFrequencies(commits);
    expect(result.get('src/a.ts')?.changeCount).toBe(1);
  });

  it('returns empty map for empty input', () => {
    const result = computeChangeFrequencies([]);
    expect(result.size).toBe(0);
  });
});

describe('analyzeHotspots', () => {
  it('ranks files by change count descending', async () => {
    const commits: NameStatusCommit[] = [
      makeCommit('a1', [{ status: 'M', filePath: 'hot.ts' }]),
      makeCommit('a2', [{ status: 'M', filePath: 'hot.ts' }]),
      makeCommit('a3', [{ status: 'M', filePath: 'hot.ts' }]),
      makeCommit('b1', [{ status: 'M', filePath: 'warm.ts' }]),
      makeCommit('b2', [{ status: 'M', filePath: 'warm.ts' }]),
      makeCommit('c1', [{ status: 'A', filePath: 'cold.ts' }]),
    ];

    const config: HotspotConfig = { followRenames: false, totalCommits: 6 };
    const result = await analyzeHotspots(commits, config);

    expect(result.hotspots).toHaveLength(3);
    expect(result.hotspots[0].filePath).toBe('hot.ts');
    expect(result.hotspots[0].changeCount).toBe(3);
    expect(result.hotspots[1].filePath).toBe('warm.ts');
    expect(result.hotspots[1].changeCount).toBe(2);
    expect(result.hotspots[2].filePath).toBe('cold.ts');
    expect(result.hotspots[2].changeCount).toBe(1);
  });

  it('returns empty hotspots for empty input', async () => {
    const config: HotspotConfig = { followRenames: false, totalCommits: 0 };
    const result = await analyzeHotspots([], config);

    expect(result.hotspots).toHaveLength(0);
    expect(result.warning).toBeUndefined();
  });

  it('respects top-20 limit for follow-renames phase', async () => {
    // Create 25 files, each with a different number of changes
    const commits: NameStatusCommit[] = [];
    for (let i = 0; i < 25; i++) {
      for (let j = 0; j <= i; j++) {
        commits.push(
          makeCommit(`hash-${i}-${j}`, [{ status: 'M', filePath: `file-${i}.ts` }]),
        );
      }
    }

    // Mock git runner: only the top-20 files should be queried
    const queriedFiles: string[] = [];
    const mockRunner: GitRunner = {
      stream: vi.fn() as any,
      exec: vi.fn(async (args: string[]) => {
        const dashDashIdx = args.indexOf('--');
        const filePath = dashDashIdx >= 0 ? args[dashDashIdx + 1] : '';
        queriedFiles.push(filePath);
        // Return same count as phase 1 (just hash lines)
        return 'a'.repeat(40) + '\nfile.ts\n';
      }),
    };

    const config: HotspotConfig = { followRenames: true, totalCommits: 100 };
    await analyzeHotspots(commits, config, mockRunner, defaultFilters);

    // Only top-20 files should have been queried
    expect(queriedFiles).toHaveLength(20);
  });

  it('uses follow-based counts when followRenames is enabled', async () => {
    const commits: NameStatusCommit[] = [
      makeCommit('a1', [{ status: 'M', filePath: 'renamed.ts' }]),
      makeCommit('a2', [{ status: 'M', filePath: 'renamed.ts' }]),
      makeCommit('b1', [{ status: 'M', filePath: 'stable.ts' }]),
    ];

    // Follow output for renamed.ts shows 5 commits (including pre-rename history)
    const followOutputs = new Map<string, string>();
    followOutputs.set(
      'renamed.ts',
      [
        'aaaa'.repeat(10), 'renamed.ts',
        'bbbb'.repeat(10), 'renamed.ts',
        'cccc'.repeat(10), 'old-name.ts',
        'dddd'.repeat(10), 'old-name.ts',
        'eeee'.repeat(10), 'original.ts',
      ].join('\n'),
    );
    followOutputs.set(
      'stable.ts',
      ['ffff'.repeat(10), 'stable.ts'].join('\n'),
    );

    const mockRunner = makeMockGitRunner(followOutputs);
    const config: HotspotConfig = { followRenames: true, totalCommits: 100 };
    const result = await analyzeHotspots(commits, config, mockRunner, defaultFilters);

    // renamed.ts should now have 5 (from follow), stable.ts should have 1
    const renamed = result.hotspots.find((h) => h.filePath === 'renamed.ts');
    const stable = result.hotspots.find((h) => h.filePath === 'stable.ts');
    expect(renamed?.changeCount).toBe(5);
    expect(stable?.changeCount).toBe(1);

    // renamed.ts should be ranked first
    expect(result.hotspots[0].filePath).toBe('renamed.ts');
  });

  it('includes warning when followRenames is true and totalCommits > 5000', async () => {
    const commits: NameStatusCommit[] = [
      makeCommit('a1', [{ status: 'M', filePath: 'file.ts' }]),
    ];

    const followOutputs = new Map<string, string>();
    followOutputs.set('file.ts', 'a'.repeat(40) + '\nfile.ts\n');
    const mockRunner = makeMockGitRunner(followOutputs);

    const config: HotspotConfig = { followRenames: true, totalCommits: 6000 };
    const result = await analyzeHotspots(commits, config, mockRunner, defaultFilters);

    expect(result.warning).toBeDefined();
    expect(result.warning).toContain('slow');
    expect(result.warning).toContain('6000');
  });

  it('does not include warning when followRenames is true but totalCommits <= 5000', async () => {
    const commits: NameStatusCommit[] = [
      makeCommit('a1', [{ status: 'M', filePath: 'file.ts' }]),
    ];

    const followOutputs = new Map<string, string>();
    followOutputs.set('file.ts', 'a'.repeat(40) + '\nfile.ts\n');
    const mockRunner = makeMockGitRunner(followOutputs);

    const config: HotspotConfig = { followRenames: true, totalCommits: 5000 };
    const result = await analyzeHotspots(commits, config, mockRunner, defaultFilters);

    expect(result.warning).toBeUndefined();
  });

  it('does not run phase 2 when followRenames is false', async () => {
    const commits: NameStatusCommit[] = [
      makeCommit('a1', [{ status: 'M', filePath: 'file.ts' }]),
    ];

    const mockRunner: GitRunner = {
      stream: vi.fn() as any,
      exec: vi.fn(),
    };

    const config: HotspotConfig = { followRenames: false, totalCommits: 100 };
    await analyzeHotspots(commits, config, mockRunner, defaultFilters);

    expect(mockRunner.exec).not.toHaveBeenCalled();
  });

  it('re-sorts hotspots after follow-based count updates', async () => {
    // Phase 1: fileA has 3 changes, fileB has 2
    // Phase 2 (follow): fileA still 3, fileB gets 10 (rename history)
    const commits: NameStatusCommit[] = [
      makeCommit('a1', [{ status: 'M', filePath: 'fileA.ts' }]),
      makeCommit('a2', [{ status: 'M', filePath: 'fileA.ts' }]),
      makeCommit('a3', [{ status: 'M', filePath: 'fileA.ts' }]),
      makeCommit('b1', [{ status: 'M', filePath: 'fileB.ts' }]),
      makeCommit('b2', [{ status: 'M', filePath: 'fileB.ts' }]),
    ];

    const followOutputs = new Map<string, string>();
    // fileA: 3 commits
    followOutputs.set('fileA.ts', [
      'a'.repeat(40), 'fileA.ts',
      'b'.repeat(40), 'fileA.ts',
      'c'.repeat(40), 'fileA.ts',
    ].join('\n'));
    // fileB: 10 commits (lots of rename history)
    // Use hex-safe characters (0-9, a-f) for valid commit hashes
    const fileBHashes = Array.from({ length: 10 }, (_, i) => {
      const hexChar = i.toString(16); // 0-9 then a
      return hexChar.repeat(40);
    });
    followOutputs.set('fileB.ts', fileBHashes.map((h) => `${h}\nfileB.ts`).join('\n'));

    const mockRunner = makeMockGitRunner(followOutputs);
    const config: HotspotConfig = { followRenames: true, totalCommits: 100 };
    const result = await analyzeHotspots(commits, config, mockRunner, defaultFilters);

    // After follow, fileB should be ranked first (10 > 3)
    expect(result.hotspots[0].filePath).toBe('fileB.ts');
    expect(result.hotspots[0].changeCount).toBe(10);
    expect(result.hotspots[1].filePath).toBe('fileA.ts');
    expect(result.hotspots[1].changeCount).toBe(3);
  });
});
