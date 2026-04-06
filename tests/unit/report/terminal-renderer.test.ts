import { describe, it, expect } from 'vitest';
import { renderTerminalReport } from '../../../src/report/terminal-renderer.js';
import type { ReportData } from '../../../src/report/aggregator.js';

function makeReportData(overrides?: Partial<ReportData>): ReportData {
  return {
    repoName: 'test-repo',
    analyzedBranch: 'main',
    dateRange: {
      from: new Date('2024-01-01'),
      to: new Date('2024-06-01'),
    },
    contributions: {
      authors: [
        { name: 'Alice', email: 'alice@test.com', commits: 50, linesAdded: 1000, linesRemoved: 200 },
        { name: 'Bob', email: 'bob@test.com', commits: 30, linesAdded: 500, linesRemoved: 100 },
      ],
      heatmap: Array.from({ length: 7 }, () => Array(24).fill(0)),
      totalCommits: 80,
    },
    hotspots: {
      hotspots: [
        { filePath: 'src/index.ts', changeCount: 25, uniqueAuthors: 3 },
        { filePath: 'src/utils.ts', changeCount: 15, uniqueAuthors: 2 },
      ],
    },
    complexity: {
      snapshots: [
        { date: new Date('2024-01-01'), totalFiles: 10, totalSize: 5000, churnRate: 0 },
        { date: new Date('2024-03-01'), totalFiles: 15, totalSize: 8000, churnRate: 0.3 },
        { date: new Date('2024-06-01'), totalFiles: 20, totalSize: 12000, churnRate: 0.2 },
      ],
      interval: 'monthly' as const,
    },
    busFactor: {
      overall: { scope: 'overall', busFactor: 2, topAuthors: [{ name: 'Alice', weightedCommits: 40 }] },
      perDirectory: new Map([
        ['src', { scope: 'src', busFactor: 2, topAuthors: [{ name: 'Alice', weightedCommits: 30 }] }],
      ]),
      singlePointRisks: [{ filePath: 'src/secret.ts', soleAuthor: 'Alice', totalChanges: 5, authorPercentage: 100, firstSeen: '2024-01-01T00:00:00.000Z', lastSeen: '2024-06-01T00:00:00.000Z', spanMonths: 5 }],
    },
    prVelocity: {
      available: true,
      averageMergeTime: 86400000, // 1 day in ms
      mergesPerMonth: [
        { month: '2024-01', count: 5 },
        { month: '2024-02', count: 8 },
        { month: '2024-03', count: 3 },
      ],
      totalMerges: 16,
    },
    generatedAt: new Date('2024-06-15T12:00:00Z'),
    ...overrides,
  };
}

// Regex to detect ANSI escape sequences
const ANSI_REGEX = /\x1b\[/;

describe('renderTerminalReport', () => {
  describe('noColor=true', () => {
    it('output contains zero ANSI escape sequences', () => {
      const data = makeReportData();
      const output = renderTerminalReport(data, true);
      expect(output).not.toMatch(ANSI_REGEX);
    });

    it('still contains section headers as plain text', () => {
      const data = makeReportData();
      const output = renderTerminalReport(data, true);
      expect(output).toContain('Contributors');
      expect(output).toContain('Code Hotspots');
      expect(output).toContain('Complexity Trend');
      expect(output).toContain('Bus Factor');
      expect(output).toContain('PR Velocity');
    });
  });

  describe('noColor=false', () => {
    it('output contains ANSI escape sequences', () => {
      const data = makeReportData();
      const output = renderTerminalReport(data, false);
      expect(output).toMatch(ANSI_REGEX);
    });
  });

  describe('section content', () => {
    it('contains repo name and branch', () => {
      const data = makeReportData();
      const output = renderTerminalReport(data, true);
      expect(output).toContain('test-repo');
      expect(output).toContain('main');
    });

    it('contains contributor names', () => {
      const data = makeReportData();
      const output = renderTerminalReport(data, true);
      expect(output).toContain('Alice');
      expect(output).toContain('Bob');
    });

    it('contains hotspot file paths', () => {
      const data = makeReportData();
      const output = renderTerminalReport(data, true);
      expect(output).toContain('src/index.ts');
      expect(output).toContain('src/utils.ts');
    });

    it('contains box-drawing characters', () => {
      const data = makeReportData();
      const output = renderTerminalReport(data, true);
      expect(output).toContain('┌');
      expect(output).toContain('│');
      expect(output).toContain('└');
    });

    it('contains sparkline characters for complexity', () => {
      const data = makeReportData();
      const output = renderTerminalReport(data, true);
      // Sparkline should contain at least one block character
      expect(output).toMatch(/[▁▂▃▄▅▆▇█]/);
    });

    it('shows PR velocity warning when unavailable', () => {
      const data = makeReportData({
        prVelocity: {
          available: false,
          averageMergeTime: null,
          mergesPerMonth: [],
          totalMerges: 0,
          warningMessage: 'No merge commits found.',
        },
      });
      const output = renderTerminalReport(data, true);
      expect(output).toContain('No merge commits found.');
    });

    it('shows bus factor value', () => {
      const data = makeReportData();
      const output = renderTerminalReport(data, true);
      expect(output).toContain('Overall:');
      expect(output).toContain('2');
    });
  });
});
