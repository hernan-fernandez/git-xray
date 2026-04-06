// Feature: gitpeek, Property 17: No-color output correctness
// For any ReportData rendered with renderTerminalReport(data, true),
// the output should contain zero ANSI escape sequences (no \x1b[ patterns).
// **Validates: Requirements 8.3**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { renderTerminalReport } from '../../src/report/terminal-renderer.js';
import type { ReportData } from '../../src/report/aggregator.js';

// --- Arbitraries ---

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

const arbHotspot = fc.record({
  filePath: arbFilePath,
  changeCount: fc.integer({ min: 1, max: 100 }),
  uniqueAuthors: fc.integer({ min: 1, max: 10 }),
});

const arbSnapshot = fc.record({
  date: arbDate,
  totalFiles: fc.integer({ min: 1, max: 500 }),
  totalSize: fc.integer({ min: 100, max: 100000 }),
  churnRate: fc.double({ min: 0, max: 1, noNaN: true }),
});

const arbBusFactorResult = fc.record({
  scope: fc.constant('overall'),
  busFactor: fc.integer({ min: 0, max: 10 }),
  topAuthors: fc.array(
    fc.record({ name: arbName, weightedCommits: fc.double({ min: 0.1, max: 100, noNaN: true }) }),
    { minLength: 0, maxLength: 3 },
  ),
});

const arbReportData: fc.Arbitrary<ReportData> = fc.record({
  repoName: arbName,
  analyzedBranch: fc.constantFrom('main', 'master', 'develop'),
  dateRange: fc.record({ from: arbDate, to: arbDate }),
  contributions: fc.record({
    authors: fc.array(arbAuthorSummary, { minLength: 0, maxLength: 5 }),
    heatmap: fc.constant(Array.from({ length: 7 }, () => Array(24).fill(0))),
    totalCommits: fc.integer({ min: 0, max: 500 }),
  }),
  hotspots: fc.record({
    hotspots: fc.array(arbHotspot, { minLength: 0, maxLength: 5 }),
  }),
  complexity: fc.record({
    snapshots: fc.array(arbSnapshot, { minLength: 0, maxLength: 5 }),
    interval: fc.constantFrom('weekly' as const, 'monthly' as const),
  }),
  busFactor: fc.record({
    overall: arbBusFactorResult,
    perDirectory: fc.constant(new Map<string, any>()),
    singlePointRisks: fc.array(arbFilePath, { minLength: 0, maxLength: 3 }),
  }),
  prVelocity: fc.record({
    available: fc.boolean(),
    averageMergeTime: fc.oneof(fc.constant(null), fc.integer({ min: 1000, max: 86400000 })),
    mergesPerMonth: fc.array(
      fc.record({ month: fc.stringMatching(/^20\d{2}-\d{2}$/), count: fc.integer({ min: 1, max: 20 }) }),
      { minLength: 0, maxLength: 3 },
    ),
    totalMerges: fc.integer({ min: 0, max: 50 }),
  }),
  generatedAt: arbDate,
});

const ANSI_REGEX = /\x1b\[/;

describe('Property 17: No-color output correctness', () => {
  it('no ANSI escape sequences when noColor=true', () => {
    fc.assert(
      fc.property(arbReportData, (reportData) => {
        const output = renderTerminalReport(reportData, true);
        expect(output).not.toMatch(ANSI_REGEX);
      }),
      { numRuns: 100 },
    );
  });
});
