// Feature: gitpeek, Property 15: HTML report self-containment
// For any generated ReportData, the HTML output from renderHtmlReport should
// contain zero external resource references (no src="http" or href="http" patterns).
// **Validates: Requirements 7.1**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { renderHtmlReport } from '../../src/report/html-renderer.js';
import type { ReportData } from '../../src/report/aggregator.js';
import type { ContributionData } from '../../src/analyzers/contributions.js';
import type { HotspotData } from '../../src/analyzers/hotspots.js';
import type { ComplexityTrendData } from '../../src/analyzers/complexity.js';
import type { BusFactorData } from '../../src/analyzers/bus-factor.js';
import type { PRVelocityData } from '../../src/analyzers/pr-velocity.js';

// --- Arbitraries for minimal but valid ReportData ---

const arbName = fc.stringMatching(/^[A-Za-z]{2,10}$/);
const arbEmail = fc.stringMatching(/^[a-z]{2,6}@[a-z]{2,6}\.[a-z]{2,3}$/);
const arbFilePath = fc.stringMatching(/^[a-z]{1,6}\/[a-z]{1,6}\.[a-z]{1,3}$/);
const arbDate = fc.date({
  min: new Date('2022-01-01T00:00:00Z'),
  max: new Date('2025-06-01T00:00:00Z'),
  noInvalidDate: true,
});

const arbAuthorSummary = fc.record({
  name: arbName,
  email: arbEmail,
  commits: fc.integer({ min: 1, max: 200 }),
  linesAdded: fc.nat({ max: 5000 }),
  linesRemoved: fc.nat({ max: 5000 }),
});

const arbContributions: fc.Arbitrary<ContributionData> = fc.record({
  authors: fc.array(arbAuthorSummary, { minLength: 1, maxLength: 5 }),
  heatmap: fc.constant(Array.from({ length: 7 }, () => Array(24).fill(0))),
  totalCommits: fc.integer({ min: 1, max: 500 }),
});

const arbHotspot = fc.record({
  filePath: arbFilePath,
  changeCount: fc.integer({ min: 1, max: 100 }),
  uniqueAuthors: fc.integer({ min: 1, max: 10 }),
});

const arbHotspots: fc.Arbitrary<HotspotData> = fc.record({
  hotspots: fc.array(arbHotspot, { minLength: 0, maxLength: 5 }),
});

const arbSnapshot = fc.record({
  date: arbDate,
  totalFiles: fc.integer({ min: 1, max: 500 }),
  totalSize: fc.integer({ min: 100, max: 100000 }),
  churnRate: fc.double({ min: 0, max: 1, noNaN: true }),
});

const arbComplexity: fc.Arbitrary<ComplexityTrendData> = fc.record({
  snapshots: fc.array(arbSnapshot, { minLength: 1, maxLength: 3 }),
  interval: fc.constantFrom('weekly' as const, 'monthly' as const),
});

const arbBusFactorResult = fc.record({
  scope: fc.constant('overall'),
  busFactor: fc.integer({ min: 0, max: 10 }),
  topAuthors: fc.array(
    fc.record({ name: arbName, weightedCommits: fc.double({ min: 0.1, max: 100, noNaN: true }) }),
    { minLength: 0, maxLength: 3 },
  ),
});

const arbBusFactor: fc.Arbitrary<BusFactorData> = fc.record({
  overall: arbBusFactorResult,
  perDirectory: fc.constant(new Map<string, any>()),
  singlePointRisks: fc.array(arbFilePath, { minLength: 0, maxLength: 3 }),
});

const arbPRVelocity: fc.Arbitrary<PRVelocityData> = fc.record({
  available: fc.boolean(),
  averageMergeTime: fc.oneof(fc.constant(null), fc.integer({ min: 1000, max: 86400000 })),
  mergesPerMonth: fc.array(
    fc.record({ month: fc.stringMatching(/^20\d{2}-\d{2}$/), count: fc.integer({ min: 1, max: 20 }) }),
    { minLength: 0, maxLength: 3 },
  ),
  totalMerges: fc.integer({ min: 0, max: 50 }),
});

const arbReportData: fc.Arbitrary<ReportData> = fc.record({
  repoName: arbName,
  analyzedBranch: fc.constantFrom('main', 'master', 'develop'),
  dateRange: fc.record({ from: arbDate, to: arbDate }),
  contributions: arbContributions,
  hotspots: arbHotspots,
  complexity: arbComplexity,
  busFactor: arbBusFactor,
  prVelocity: arbPRVelocity,
  generatedAt: arbDate,
});

describe('Property 15: HTML report self-containment', () => {
  it('zero external resource references in generated HTML', () => {
    fc.assert(
      fc.asyncProperty(arbReportData, async (reportData) => {
        const html = await renderHtmlReport(reportData);

        // No external script references
        expect(html).not.toMatch(/<script[^>]+src\s*=\s*["']https?:\/\//i);

        // No external stylesheet references
        expect(html).not.toMatch(/<link[^>]+href\s*=\s*["']https?:\/\//i);

        // No external image references
        expect(html).not.toMatch(/<img[^>]+src\s*=\s*["']https?:\/\//i);

        // General check: no src or href pointing to http/https
        expect(html).not.toMatch(/(?:src|href)\s*=\s*["']https?:\/\//i);
      }),
      { numRuns: 100 },
    );
  });
});
