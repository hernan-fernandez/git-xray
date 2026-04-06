// Feature: gitpeek, Property 16: Report data truncation and JSON completeness
// For any ReportData where hotspots exceed 100 or contributors exceed 50,
// truncateForHtml should produce at most 100 hotspots and 50 contributors.
// The original (JSON) data should remain untruncated.
// **Validates: Requirements 7.7, 7.8**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { truncateForHtml } from '../../src/report/aggregator.js';
import type { ReportData } from '../../src/report/aggregator.js';
import type { AuthorSummary } from '../../src/analyzers/contributions.js';
import type { FileHotspot } from '../../src/analyzers/hotspots.js';

// --- Arbitraries ---

const arbName = fc.stringMatching(/^[A-Za-z]{2,10}$/);
const arbEmail = fc.stringMatching(/^[a-z]{2,6}@[a-z]{2,6}\.[a-z]{2,3}$/);
const arbFilePath = fc.stringMatching(/^[a-z]{1,6}\/[a-z]{1,6}\.[a-z]{1,3}$/);
const arbDate = fc.date({
  min: new Date('2022-01-01T00:00:00Z'),
  max: new Date('2025-06-01T00:00:00Z'),
  noInvalidDate: true,
});

const arbAuthor: fc.Arbitrary<AuthorSummary> = fc.record({
  name: arbName,
  email: arbEmail,
  commits: fc.integer({ min: 1, max: 200 }),
  linesAdded: fc.nat({ max: 5000 }),
  linesRemoved: fc.nat({ max: 5000 }),
});

const arbHotspot: fc.Arbitrary<FileHotspot> = fc.record({
  filePath: arbFilePath,
  changeCount: fc.integer({ min: 1, max: 100 }),
  uniqueAuthors: fc.integer({ min: 1, max: 10 }),
});

function buildReportData(hotspots: FileHotspot[], authors: AuthorSummary[]): ReportData {
  return {
    repoName: 'test-repo',
    analyzedBranch: 'main',
    dateRange: { from: new Date('2024-01-01'), to: new Date('2024-06-01') },
    contributions: {
      authors,
      heatmap: Array.from({ length: 7 }, () => Array(24).fill(0)),
      totalCommits: authors.reduce((s, a) => s + a.commits, 0),
    },
    hotspots: { hotspots },
    complexity: { snapshots: [], interval: 'monthly' as const },
    busFactor: {
      overall: { scope: 'overall', busFactor: 1, topAuthors: [] },
      perDirectory: new Map(),
      singlePointRisks: [],
    },
    prVelocity: {
      available: false,
      averageMergeTime: null,
      mergesPerMonth: [],
      totalMerges: 0,
    },
    generatedAt: new Date(),
  };
}

describe('Property 16: Report data truncation and JSON completeness', () => {
  it('HTML truncated to at most 100 hotspots and 50 contributors; original untruncated', () => {
    fc.assert(
      fc.property(
        fc.array(arbHotspot, { minLength: 0, maxLength: 200 }),
        fc.array(arbAuthor, { minLength: 0, maxLength: 100 }),
        (hotspots, authors) => {
          const report = buildReportData(hotspots, authors);
          const originalHotspotCount = report.hotspots.hotspots.length;
          const originalAuthorCount = report.contributions.authors.length;

          const truncated = truncateForHtml(report);

          // HTML-bound data respects limits
          expect(truncated.hotspots.hotspots.length).toBeLessThanOrEqual(100);
          expect(truncated.contributions.authors.length).toBeLessThanOrEqual(50);

          // Original (JSON) data is unmodified
          expect(report.hotspots.hotspots.length).toBe(originalHotspotCount);
          expect(report.contributions.authors.length).toBe(originalAuthorCount);
        },
      ),
      { numRuns: 100 },
    );
  });
});
