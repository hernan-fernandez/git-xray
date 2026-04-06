import { describe, it, expect, afterEach } from 'vitest';
import { writeJsonReport } from '../../../src/report/json-writer.js';
import { aggregateReport, type AggregateInput } from '../../../src/report/aggregator.js';
import type { ContributionData } from '../../../src/analyzers/contributions.js';
import type { HotspotData } from '../../../src/analyzers/hotspots.js';
import type { ComplexityTrendData } from '../../../src/analyzers/complexity.js';
import type { BusFactorData, BusFactorResult } from '../../../src/analyzers/bus-factor.js';
import type { PRVelocityData } from '../../../src/analyzers/pr-velocity.js';
import { readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function makeReport(perDirEntries?: [string, BusFactorResult][]) {
  const contributions: ContributionData = {
    authors: [{ name: 'Alice', email: 'a@t.com', commits: 10, linesAdded: 100, linesRemoved: 20 }],
    heatmap: Array.from({ length: 7 }, () => Array(24).fill(0)),
    totalCommits: 10,
  };
  const hotspots: HotspotData = {
    hotspots: [{ filePath: 'src/index.ts', changeCount: 5, uniqueAuthors: 1 }],
  };
  const complexity: ComplexityTrendData = { snapshots: [], interval: 'monthly' };

  const perDirectory = new Map<string, BusFactorResult>(
    perDirEntries ?? [
      ['src', { scope: 'src', busFactor: 2, topAuthors: [{ name: 'Alice', weightedCommits: 8 }] }],
      ['tests', { scope: 'tests', busFactor: 1, topAuthors: [{ name: 'Bob', weightedCommits: 3 }] }],
    ],
  );

  const busFactor: BusFactorData = {
    overall: { scope: 'overall', busFactor: 2, topAuthors: [] },
    perDirectory,
    singlePointRisks: ['lonely-file.ts'],
  };
  const prVelocity: PRVelocityData = {
    available: true,
    averageMergeTime: 86400000,
    mergesPerMonth: [{ month: '2024-01', count: 3 }],
    totalMerges: 3,
  };

  const input: AggregateInput = {
    repoName: 'test-repo',
    branch: 'main',
    dateRange: { from: new Date('2024-01-01'), to: new Date('2024-06-01') },
    contributions,
    hotspots,
    complexity,
    busFactor,
    prVelocity,
  };

  return aggregateReport(input);
}

describe('writeJsonReport', () => {
  const tempFiles: string[] = [];

  afterEach(async () => {
    for (const f of tempFiles) {
      await unlink(f).catch(() => {});
    }
    tempFiles.length = 0;
  });

  it('should write valid JSON to disk', async () => {
    const report = makeReport();
    const outPath = join(tmpdir(), `gitpeek-test-${Date.now()}.json`);
    tempFiles.push(outPath);

    await writeJsonReport(report, outPath);

    const raw = await readFile(outPath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.repoName).toBe('test-repo');
    expect(parsed.analyzedBranch).toBe('main');
  });

  it('should use 2-space indentation', async () => {
    const report = makeReport();
    const outPath = join(tmpdir(), `gitpeek-test-indent-${Date.now()}.json`);
    tempFiles.push(outPath);

    await writeJsonReport(report, outPath);

    const raw = await readFile(outPath, 'utf-8');
    // 2-space indent means lines start with "  " (not tabs or 4 spaces)
    const lines = raw.split('\n');
    const indentedLines = lines.filter((l) => l.startsWith('  '));
    expect(indentedLines.length).toBeGreaterThan(0);
    // No 4-space-only indented first-level keys
    const firstLevelKeys = lines.filter((l) => /^  "\w/.test(l));
    expect(firstLevelKeys.length).toBeGreaterThan(0);
  });

  it('should serialize Map instances as plain objects', async () => {
    const report = makeReport();
    const outPath = join(tmpdir(), `gitpeek-test-map-${Date.now()}.json`);
    tempFiles.push(outPath);

    await writeJsonReport(report, outPath);

    const raw = await readFile(outPath, 'utf-8');
    const parsed = JSON.parse(raw);

    // perDirectory should be a plain object, not empty or missing
    expect(parsed.busFactor.perDirectory).toBeDefined();
    expect(typeof parsed.busFactor.perDirectory).toBe('object');
    expect(parsed.busFactor.perDirectory.src).toBeDefined();
    expect(parsed.busFactor.perDirectory.src.scope).toBe('src');
    expect(parsed.busFactor.perDirectory.tests).toBeDefined();
    expect(parsed.busFactor.perDirectory.tests.scope).toBe('tests');
  });

  it('should preserve the full untruncated dataset', async () => {
    const report = makeReport();
    const outPath = join(tmpdir(), `gitpeek-test-full-${Date.now()}.json`);
    tempFiles.push(outPath);

    await writeJsonReport(report, outPath);

    const raw = await readFile(outPath, 'utf-8');
    const parsed = JSON.parse(raw);

    expect(parsed.hotspots.hotspots).toHaveLength(1);
    expect(parsed.contributions.authors).toHaveLength(1);
    expect(parsed.busFactor.singlePointRisks).toEqual(['lonely-file.ts']);
  });

  it('should handle empty perDirectory Map', async () => {
    const report = makeReport([]);
    const outPath = join(tmpdir(), `gitpeek-test-empty-map-${Date.now()}.json`);
    tempFiles.push(outPath);

    await writeJsonReport(report, outPath);

    const raw = await readFile(outPath, 'utf-8');
    const parsed = JSON.parse(raw);
    expect(parsed.busFactor.perDirectory).toEqual({});
  });
});
