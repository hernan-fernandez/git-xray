import { describe, it, expect } from 'vitest';
import { renderHtmlReport } from '../../../src/report/html-renderer.js';
import type { ReportData } from '../../../src/report/aggregator.js';
import type { ContributionData } from '../../../src/analyzers/contributions.js';
import type { HotspotData } from '../../../src/analyzers/hotspots.js';
import type { ComplexityTrendData } from '../../../src/analyzers/complexity.js';
import type { BusFactorData } from '../../../src/analyzers/bus-factor.js';
import type { PRVelocityData } from '../../../src/analyzers/pr-velocity.js';

function makeSampleReportData(): ReportData {
  const contributions: ContributionData = {
    authors: [
      { name: 'Alice', email: 'alice@test.com', commits: 50, linesAdded: 1000, linesRemoved: 200 },
      { name: 'Bob', email: 'bob@test.com', commits: 30, linesAdded: 500, linesRemoved: 100 },
    ],
    heatmap: Array.from({ length: 7 }, () => Array(24).fill(0)),
    totalCommits: 80,
  };

  const hotspots: HotspotData = {
    hotspots: [
      { filePath: 'src/index.ts', changeCount: 42, uniqueAuthors: 3 },
      { filePath: 'src/utils.ts', changeCount: 28, uniqueAuthors: 2 },
    ],
  };

  const complexity: ComplexityTrendData = {
    snapshots: [
      { date: new Date('2024-01-01'), totalFiles: 10, totalSize: 5000, churnRate: 0 },
      { date: new Date('2024-02-01'), totalFiles: 12, totalSize: 6000, churnRate: 0.17 },
    ],
    interval: 'monthly',
  };

  const busFactor: BusFactorData = {
    overall: { scope: 'overall', busFactor: 2, topAuthors: [{ name: 'Alice', weightedCommits: 40 }] },
    perDirectory: new Map([
      ['src', { scope: 'src', busFactor: 1, topAuthors: [{ name: 'Alice', weightedCommits: 30 }] }],
    ]),
    singlePointRisks: ['src/secret.ts'],
  };

  const prVelocity: PRVelocityData = {
    available: true,
    averageMergeTime: 86400000,
    mergesPerMonth: [{ month: '2024-01', count: 5 }],
    totalMerges: 5,
  };

  return {
    repoName: 'test-repo',
    analyzedBranch: 'main',
    dateRange: { from: new Date('2024-01-01'), to: new Date('2024-06-01') },
    contributions,
    hotspots,
    complexity,
    busFactor,
    prVelocity,
    generatedAt: new Date('2024-06-15'),
  };
}

describe('renderHtmlReport', () => {
  it('should produce valid HTML structure with html, head, and body tags', async () => {
    const html = await renderHtmlReport(makeSampleReportData());
    expect(html).toContain('<html');
    expect(html).toContain('<head>');
    expect(html).toContain('<body>');
    expect(html).toContain('</html>');
  });

  it('should contain no external link tags (no <link href="http")', async () => {
    const html = await renderHtmlReport(makeSampleReportData());
    expect(html).not.toMatch(/<link[^>]+href\s*=\s*["']https?:\/\//i);
  });

  it('should contain no external script tags (no <script src="http")', async () => {
    const html = await renderHtmlReport(makeSampleReportData());
    expect(html).not.toMatch(/<script[^>]+src\s*=\s*["']https?:\/\//i);
  });

  it('should contain no external image tags (no <img src="http")', async () => {
    const html = await renderHtmlReport(makeSampleReportData());
    expect(html).not.toMatch(/<img[^>]+src\s*=\s*["']https?:\/\//i);
  });

  it('should have zero external resource references of any kind', async () => {
    const html = await renderHtmlReport(makeSampleReportData());
    // No src or href pointing to http/https
    expect(html).not.toMatch(/(?:src|href)\s*=\s*["']https?:\/\//i);
  });

  it('should contain the serialized ReportData with window.__GITPEEK_DATA__', async () => {
    const data = makeSampleReportData();
    const html = await renderHtmlReport(data);
    expect(html).toContain('window.__GITPEEK_DATA__');
    expect(html).toContain('"repoName":"test-repo"');
    expect(html).toContain('"analyzedBranch":"main"');
  });

  it('should contain author data from the report', async () => {
    const html = await renderHtmlReport(makeSampleReportData());
    expect(html).toContain('"name":"Alice"');
    expect(html).toContain('"name":"Bob"');
  });

  it('should contain hotspot data from the report', async () => {
    const html = await renderHtmlReport(makeSampleReportData());
    expect(html).toContain('src/index.ts');
    expect(html).toContain('src/utils.ts');
  });

  it('should inline the ECharts library (contains echarts reference)', async () => {
    const html = await renderHtmlReport(makeSampleReportData());
    // ECharts minified JS contains the word "echarts" many times
    expect(html).toContain('echarts');
    // Should be inlined in a script tag, not an external reference
    expect(html).toMatch(/<script>[^]*echarts[^]*<\/script>/);
  });

  it('should contain inline CSS (no external stylesheets)', async () => {
    const html = await renderHtmlReport(makeSampleReportData());
    expect(html).toContain('<style>');
    expect(html).not.toMatch(/<link[^>]+rel\s*=\s*["']stylesheet["'][^>]+href/i);
  });

  it('should serialize Map instances (perDirectory) as plain objects', async () => {
    const html = await renderHtmlReport(makeSampleReportData());
    // perDirectory should be serialized as an object, not lost
    expect(html).toContain('"src"');
    expect(html).toContain('"busFactor":1');
  });
});
