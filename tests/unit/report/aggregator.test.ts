import { describe, it, expect } from 'vitest';
import {
  aggregateReport,
  truncateForHtml,
  truncateForTerminal,
  type AggregateInput,
  type ReportData,
} from '../../../src/report/aggregator.js';
import type { ContributionData, AuthorSummary } from '../../../src/analyzers/contributions.js';
import type { HotspotData, FileHotspot } from '../../../src/analyzers/hotspots.js';
import type { ComplexityTrendData } from '../../../src/analyzers/complexity.js';
import type { BusFactorData } from '../../../src/analyzers/bus-factor.js';
import type { PRVelocityData } from '../../../src/analyzers/pr-velocity.js';

// --- Helpers ---

function makeAuthor(i: number): AuthorSummary {
  return { name: `author-${i}`, email: `a${i}@test.com`, commits: 100 - i, linesAdded: 10, linesRemoved: 5 };
}

function makeHotspot(i: number): FileHotspot {
  return { filePath: `file-${i}.ts`, changeCount: 200 - i, uniqueAuthors: 3 };
}

function makeInput(hotspotCount: number, authorCount: number): AggregateInput {
  const authors = Array.from({ length: authorCount }, (_, i) => makeAuthor(i));
  const hotspots: FileHotspot[] = Array.from({ length: hotspotCount }, (_, i) => makeHotspot(i));

  const contributions: ContributionData = {
    authors,
    heatmap: Array.from({ length: 7 }, () => Array(24).fill(0)),
    totalCommits: authorCount * 10,
  };

  const hotspotData: HotspotData = { hotspots };

  const complexity: ComplexityTrendData = { snapshots: [], interval: 'monthly' };

  const busFactor: BusFactorData = {
    overall: { scope: 'overall', busFactor: 2, topAuthors: [] },
    perDirectory: new Map(),
    singlePointRisks: [],
  };

  const prVelocity: PRVelocityData = {
    available: true,
    averageMergeTime: 86400000,
    mergesPerMonth: [{ month: '2024-01', count: 5 }],
    totalMerges: 5,
  };

  return {
    repoName: 'test-repo',
    branch: 'main',
    dateRange: { from: new Date('2024-01-01'), to: new Date('2024-06-01') },
    contributions,
    hotspots: hotspotData,
    complexity,
    busFactor,
    prVelocity,
  };
}

function buildReport(hotspotCount: number, authorCount: number): ReportData {
  return aggregateReport(makeInput(hotspotCount, authorCount));
}

// --- Tests ---

describe('aggregateReport', () => {
  it('should produce a ReportData with all fields populated', () => {
    const report = buildReport(5, 3);
    expect(report.repoName).toBe('test-repo');
    expect(report.analyzedBranch).toBe('main');
    expect(report.hotspots.hotspots).toHaveLength(5);
    expect(report.contributions.authors).toHaveLength(3);
    expect(report.generatedAt).toBeInstanceOf(Date);
  });
});

describe('truncateForHtml', () => {
  it('should not truncate when hotspots = 100 and contributors = 50 (at boundary)', () => {
    const report = buildReport(100, 50);
    const truncated = truncateForHtml(report);
    expect(truncated.hotspots.hotspots).toHaveLength(100);
    expect(truncated.contributions.authors).toHaveLength(50);
  });

  it('should truncate hotspots from 101 to 100', () => {
    const report = buildReport(101, 10);
    const truncated = truncateForHtml(report);
    expect(truncated.hotspots.hotspots).toHaveLength(100);
  });

  it('should truncate contributors from 51 to 50', () => {
    const report = buildReport(10, 51);
    const truncated = truncateForHtml(report);
    expect(truncated.contributions.authors).toHaveLength(50);
  });

  it('should not truncate when counts are below limits', () => {
    const report = buildReport(5, 3);
    const truncated = truncateForHtml(report);
    expect(truncated.hotspots.hotspots).toHaveLength(5);
    expect(truncated.contributions.authors).toHaveLength(3);
  });
});

describe('truncateForTerminal', () => {
  it('should not truncate when hotspots = 20 and contributors = 10 (at boundary)', () => {
    const report = buildReport(20, 10);
    const truncated = truncateForTerminal(report);
    expect(truncated.hotspots.hotspots).toHaveLength(20);
    expect(truncated.contributions.authors).toHaveLength(10);
  });

  it('should truncate hotspots from 21 to 20', () => {
    const report = buildReport(21, 5);
    const truncated = truncateForTerminal(report);
    expect(truncated.hotspots.hotspots).toHaveLength(20);
  });

  it('should truncate contributors from 11 to 10', () => {
    const report = buildReport(5, 11);
    const truncated = truncateForTerminal(report);
    expect(truncated.contributions.authors).toHaveLength(10);
  });
});

describe('JSON passthrough (no truncation)', () => {
  it('should preserve all hotspots and contributors in the full report', () => {
    const report = buildReport(200, 100);
    // aggregateReport produces the full dataset — no truncation
    expect(report.hotspots.hotspots).toHaveLength(200);
    expect(report.contributions.authors).toHaveLength(100);
  });
});

describe('immutability', () => {
  it('truncateForHtml should not modify the original ReportData', () => {
    const report = buildReport(150, 60);
    const originalHotspotCount = report.hotspots.hotspots.length;
    const originalAuthorCount = report.contributions.authors.length;

    truncateForHtml(report);

    expect(report.hotspots.hotspots).toHaveLength(originalHotspotCount);
    expect(report.contributions.authors).toHaveLength(originalAuthorCount);
  });

  it('truncateForTerminal should not modify the original ReportData', () => {
    const report = buildReport(50, 20);
    const originalHotspotCount = report.hotspots.hotspots.length;
    const originalAuthorCount = report.contributions.authors.length;

    truncateForTerminal(report);

    expect(report.hotspots.hotspots).toHaveLength(originalHotspotCount);
    expect(report.contributions.authors).toHaveLength(originalAuthorCount);
  });
});
