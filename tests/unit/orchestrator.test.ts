import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Readable } from 'node:stream';

// Mock progress
vi.mock('../../src/utils/progress.js', () => ({
  startPhase: vi.fn(),
  endPhase: vi.fn(),
  updateProgress: vi.fn(),
}));

// Mock html-renderer
vi.mock('../../src/report/html-renderer.js', () => ({
  renderHtmlReport: vi.fn().mockResolvedValue('<html>mock</html>'),
}));

// Mock terminal-renderer
vi.mock('../../src/report/terminal-renderer.js', () => ({
  renderTerminalReport: vi.fn().mockReturnValue('terminal output'),
}));

// Mock json-writer
vi.mock('../../src/report/json-writer.js', () => ({
  writeJsonReport: vi.fn().mockResolvedValue(undefined),
}));

// Mock fs/promises writeFile
vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

// Mock child_process exec (for openInBrowser)
vi.mock('node:child_process', () => ({
  exec: vi.fn((_cmd: string, cb: Function) => cb(null)),
  spawn: vi.fn(),
}));

// Mock GitRunner
const mockStream = vi.fn();
const mockExec = vi.fn();

vi.mock('../../src/git/runner.js', () => {
  return {
    GitCommandRunner: class MockGitCommandRunner {
      constructor(_repoPath: string) {}
      stream(...args: any[]) { return mockStream(...args); }
      exec(...args: any[]) { return mockExec(...args); }
    },
    GitError: class GitError extends Error {
      exitCode: number;
      stderr: string;
      constructor(message: string, exitCode: number, stderr: string) {
        super(message);
        this.name = 'GitError';
        this.exitCode = exitCode;
        this.stderr = stderr;
      }
    },
  };
});

import { runAnalysis, parseNameStatusOutput } from '../../src/orchestrator.js';
import { startPhase, endPhase } from '../../src/utils/progress.js';
import { renderHtmlReport } from '../../src/report/html-renderer.js';
import { renderTerminalReport } from '../../src/report/terminal-renderer.js';
import { writeJsonReport } from '../../src/report/json-writer.js';
import { writeFile } from 'node:fs/promises';
import type { GitPeekConfig } from '../../src/config.js';

/**
 * Create a readable stream from a string.
 */
function stringStream(content: string): Readable {
  return Readable.from([content]);
}

/**
 * Build a minimal config for testing.
 */
function testConfig(overrides: Partial<GitPeekConfig> = {}): GitPeekConfig {
  return {
    repoPath: '/tmp/test-repo',
    followRenames: false,
    output: '/tmp/report.html',
    noOpen: true,
    noColor: true,
    json: false,
    ...overrides,
  };
}

// Sample git log output (contribution log format: %H|%aN|%aE|%aI|%s|%P)
const SAMPLE_LOG = [
  'aaa0000000000000000000000000000000000001|Alice|alice@test.com|2024-06-01T10:00:00Z|Initial commit|',
  'aaa0000000000000000000000000000000000002|Bob|bob@test.com|2024-06-15T14:00:00Z|Add feature|aaa0000000000000000000000000000000000001',
].join('\n');

// Sample numstat output
const SAMPLE_NUMSTAT = [
  'aaa0000000000000000000000000000000000001|Alice|2024-06-01T10:00:00Z',
  '10\t0\tsrc/index.ts',
  '',
  'aaa0000000000000000000000000000000000002|Bob|2024-06-15T14:00:00Z',
  '5\t2\tsrc/index.ts',
  '20\t0\tsrc/feature.ts',
].join('\n');

// Sample name-status output for hotspots
const SAMPLE_NAME_STATUS = [
  'aaa0000000000000000000000000000000000001',
  'M\tsrc/index.ts',
  '',
  'aaa0000000000000000000000000000000000002',
  'M\tsrc/index.ts',
  'A\tsrc/feature.ts',
].join('\n');

// Sample first-parent log output (format: %H)
const SAMPLE_FIRST_PARENT = [
  'aaa0000000000000000000000000000000000001',
  'aaa0000000000000000000000000000000000002',
].join('\n');

// --- Test parseNameStatusOutput ---

describe('parseNameStatusOutput', () => {
  it('parses a single commit with files', () => {
    const raw = [
      'abc1234567890abc1234567890abc123456789ab',
      'M\tsrc/file.ts',
      'A\tsrc/new.ts',
      '',
    ].join('\n');

    const result = parseNameStatusOutput(raw);
    expect(result).toHaveLength(1);
    expect(result[0].commitHash).toBe('abc1234567890abc1234567890abc123456789ab');
    expect(result[0].files).toHaveLength(2);
    expect(result[0].files[0]).toEqual({ status: 'M', filePath: 'src/file.ts' });
    expect(result[0].files[1]).toEqual({ status: 'A', filePath: 'src/new.ts' });
  });

  it('parses multiple commits separated by blank lines', () => {
    const raw = [
      'aaaa34567890abc1234567890abc1234567890ab',
      'M\tsrc/a.ts',
      '',
      'bbbb34567890abc1234567890abc1234567890ab',
      'D\tsrc/b.ts',
      '',
    ].join('\n');

    const result = parseNameStatusOutput(raw);
    expect(result).toHaveLength(2);
    expect(result[0].commitHash).toBe('aaaa34567890abc1234567890abc1234567890ab');
    expect(result[1].commitHash).toBe('bbbb34567890abc1234567890abc1234567890ab');
  });

  it('handles commits without trailing blank line', () => {
    const raw = [
      'aaaa34567890abc1234567890abc1234567890ab',
      'M\tsrc/a.ts',
    ].join('\n');

    const result = parseNameStatusOutput(raw);
    expect(result).toHaveLength(1);
    expect(result[0].files).toHaveLength(1);
  });

  it('returns empty array for empty input', () => {
    expect(parseNameStatusOutput('')).toEqual([]);
  });

  it('handles consecutive blank lines', () => {
    const raw = [
      'aaaa34567890abc1234567890abc1234567890ab',
      'M\tsrc/a.ts',
      '',
      '',
      'bbbb34567890abc1234567890abc1234567890ab',
      'A\tsrc/b.ts',
    ].join('\n');

    const result = parseNameStatusOutput(raw);
    expect(result).toHaveLength(2);
  });
});

// --- Test runAnalysis ---

describe('runAnalysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock setup: all git commands return valid data
    // stream() is used for: contributionLog, contributionNumstat, mergeLog
    // exec() is used for: hotspotLog, complexity (rev-list, ls-tree), firstParentLog
    let streamCallCount = 0;
    mockStream.mockImplementation(() => {
      streamCallCount++;
      if (streamCallCount === 1) return stringStream(SAMPLE_LOG);
      if (streamCallCount === 2) return stringStream(SAMPLE_NUMSTAT);
      if (streamCallCount === 3) return stringStream(''); // mergeLog (empty = no merges)
      return stringStream('');
    });

    let execCallCount = 0;
    mockExec.mockImplementation(() => {
      execCallCount++;
      // Call 1: hotspotLog (name-status)
      if (execCallCount === 1) return Promise.resolve(SAMPLE_NAME_STATUS);
      // Remaining calls: complexity rev-list/ls-tree (return empty) and firstParentLog
      return Promise.resolve(SAMPLE_FIRST_PARENT);
    });

    // Suppress stdout.write during tests
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('runs all five phases in order and reports progress', async () => {
    await runAnalysis(testConfig());

    // startPhase should be called 5 times (one per phase)
    expect(startPhase).toHaveBeenCalledTimes(5);
    expect(endPhase).toHaveBeenCalledTimes(5);

    // Verify phase names in order
    const phaseCalls = vi.mocked(startPhase).mock.calls.map((c) => c[0]);
    expect(phaseCalls[0]).toMatch(/contribution/i);
    expect(phaseCalls[1]).toMatch(/hotspot/i);
    expect(phaseCalls[2]).toMatch(/complexity/i);
    expect(phaseCalls[3]).toMatch(/bus factor/i);
    expect(phaseCalls[4]).toMatch(/PR velocity/i);
  });

  it('generates HTML report and writes to output path', async () => {
    await runAnalysis(testConfig());

    expect(renderHtmlReport).toHaveBeenCalledTimes(1);
    expect(writeFile).toHaveBeenCalledWith('/tmp/report.html', '<html>mock</html>', 'utf-8');
  });

  it('renders terminal report to stdout', async () => {
    await runAnalysis(testConfig());

    expect(renderTerminalReport).toHaveBeenCalledTimes(1);
    expect(process.stdout.write).toHaveBeenCalledWith('terminal output');
  });

  it('writes JSON when config.json is true', async () => {
    await runAnalysis(testConfig({ json: true }));

    expect(writeJsonReport).toHaveBeenCalledTimes(1);
    expect(vi.mocked(writeJsonReport).mock.calls[0][1]).toBe('/tmp/report.json');
  });

  it('does not write JSON when config.json is false', async () => {
    await runAnalysis(testConfig({ json: false }));

    expect(writeJsonReport).not.toHaveBeenCalled();
  });

  it('handles graceful degradation when contribution phase fails', async () => {
    mockStream.mockImplementationOnce(() => {
      throw new Error('git log failed');
    });

    await runAnalysis(testConfig());

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Contribution analysis failed'),
      expect.any(String),
    );

    // Report should still be generated
    expect(renderHtmlReport).toHaveBeenCalledTimes(1);
  });

  it('handles graceful degradation when hotspot phase fails', async () => {
    mockExec.mockImplementationOnce(() => Promise.reject(new Error('hotspot failed')));

    await runAnalysis(testConfig());

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('Hotspot analysis failed'),
      expect.any(String),
    );

    expect(renderHtmlReport).toHaveBeenCalledTimes(1);
  });

  it('handles graceful degradation when PR velocity phase fails', async () => {
    let streamCallCount = 0;
    mockStream.mockImplementation(() => {
      streamCallCount++;
      if (streamCallCount === 1) return stringStream(SAMPLE_LOG);
      if (streamCallCount === 2) return stringStream(SAMPLE_NUMSTAT);
      if (streamCallCount === 3) throw new Error('merge log failed');
      return stringStream('');
    });

    await runAnalysis(testConfig());

    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('PR velocity analysis failed'),
      expect.any(String),
    );

    expect(renderHtmlReport).toHaveBeenCalledTimes(1);
  });

  it('passes config filters to git commands', async () => {
    const since = new Date('2024-01-01');
    const until = new Date('2024-12-31');

    await runAnalysis(testConfig({ since, until, branch: 'main', scope: 'src/' }));

    // stream and exec should have been called (verifying the runner was used)
    expect(mockStream).toHaveBeenCalled();
    expect(mockExec).toHaveBeenCalled();
  });

  it('endPhase is called even when a phase fails', async () => {
    mockStream.mockImplementationOnce(() => {
      throw new Error('fail');
    });

    await runAnalysis(testConfig());

    // endPhase should be called for all 5 phases (including the failed one)
    expect(endPhase).toHaveBeenCalledTimes(5);
  });
});
