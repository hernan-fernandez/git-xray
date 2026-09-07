// End-to-end regression test: runs the full unmocked pipeline (real git,
// real streams, real parsers, real renderers) against a fixture repository
// built with hostile and edge-case content.
//
// This is the test that guards the security and correctness fixes:
// - XSS payloads in file paths must be escaped in the report HTML
// - "$$" in inlined ECharts / data must survive String.replace
// - Unicode file paths must round-trip verbatim (quotePath, chunk decoding)
// - Renames must be attributed to the new path
// - A bad branch must fail with exit code 1 and no report
// - --json must never overwrite the HTML output

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, readFile, stat, writeFile, appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runAnalysis } from '../../src/orchestrator.js';
import type { GitXrayConfig } from '../../src/config.js';

// A filename cannot contain "/", so the "</script>" sequence is composed
// from a directory named "x<" holding a file named "script>...": the joined
// repo-relative path is exactly "x</script><img src=x onerror=alert(1)>.ts".
const XSS_DIR = 'x<';
const XSS_BASENAME = 'script><img src=x onerror=alert(1)>.ts';
const XSS_FILE = `${XSS_DIR}/${XSS_BASENAME}`;
const UNICODE_FILE = 'über-café.ts';

// "<" and ">" are invalid in Windows filenames; the hostile-path fixtures
// and their assertions only run on POSIX filesystems.
const HOSTILE_NAMES = process.platform !== 'win32';

let repoDir: string;
let outDir: string;

/** Run git with an argument array — no shell, so quoting/codepage issues
 *  (unicode filenames on Windows cmd.exe, "$$" expansion) cannot occur. */
function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
}

function config(overrides: Partial<GitXrayConfig> = {}): GitXrayConfig {
  return {
    repoPath: repoDir,
    followRenames: false,
    output: join(outDir, 'report.html'),
    noOpen: true,
    noColor: true,
    json: false,
    quiet: true,
    ...overrides,
  };
}

beforeAll(async () => {
  repoDir = await mkdtemp(join(tmpdir(), 'gx-e2e-repo-'));
  outDir = await mkdtemp(join(tmpdir(), 'gx-e2e-out-'));

  git(repoDir, 'init', '-q', '-b', 'main');
  git(repoDir, 'config', 'user.email', 'alice@test.com');
  git(repoDir, 'config', 'user.name', 'Alice Tester');

  // Commit 1: unicode + hostile filenames (legal on POSIX filesystems).
  // Files created via node:fs to avoid shell quoting pitfalls entirely.
  await writeFile(join(repoDir, UNICODE_FILE), 'one\n');
  if (HOSTILE_NAMES) {
    await mkdir(join(repoDir, XSS_DIR));
    await writeFile(join(repoDir, XSS_DIR, XSS_BASENAME), 'one\n');
  }
  git(repoDir, 'add', '-A');
  git(repoDir, 'commit', '-q', '-m', 'feat: initial files');

  // Commits 2-3: churn on both files (hotspot + risk eligibility)
  await appendFile(join(repoDir, UNICODE_FILE), 'two\n');
  git(repoDir, 'commit', '-q', '-am', 'chore: touch unicode');
  if (HOSTILE_NAMES) {
    await appendFile(join(repoDir, XSS_FILE), 'two\n');
    git(repoDir, 'commit', '-q', '-am', 'chore: touch hostile');
  }

  // Second author with a "$$" name (String.replace $-pattern regression);
  // passed as a literal argv element, no shell expansion possible
  git(repoDir, 'config', 'user.name', 'Bob $$ Backtick');
  git(repoDir, 'config', 'user.email', 'bob@test.com');

  // A feature branch merged with --no-ff (PR velocity data)
  git(repoDir, 'checkout', '-q', '-b', 'feature');
  await writeFile(join(repoDir, 'feature.ts'), 'feature\n');
  git(repoDir, 'add', '-A');
  git(repoDir, 'commit', '-q', '-m', 'feat: add feature');
  git(repoDir, 'checkout', '-q', 'main');
  git(repoDir, 'merge', '-q', '--no-ff', '-m', 'merge: feature', 'feature');

  // A rename (R-status parsing regression)
  git(repoDir, 'mv', UNICODE_FILE, 'renamed-ü.ts');
  git(repoDir, 'commit', '-q', '-m', 'refactor: rename');
}, 60_000);

afterAll(async () => {
  await rm(repoDir, { recursive: true, force: true });
  await rm(outDir, { recursive: true, force: true });
});

describe('full pipeline E2E (real git)', () => {
  it('analyzes the repo, writes a safe self-contained report, and exits 0', async () => {
    const exitCode = await runAnalysis(config({ json: true }));
    expect(exitCode).toBe(0);

    const html = await readFile(join(outDir, 'report.html'), 'utf-8');

    // --- XSS: the hostile path must not appear as raw markup anywhere
    expect(html).not.toContain('<img src=x onerror');
    // ...but must still be present, escaped, inside the data payload
    if (HOSTILE_NAMES) {
      expect(html).toContain('\\u003c/script>\\u003cimg');
    }

    // --- $-pattern integrity: ECharts' own "$$" survives injection
    expect(html).toContain('$$');
    // --- author with "$$" in the name round-trips untouched
    expect(html).toContain('Bob $$ Backtick');

    // --- unicode paths verbatim (quotePath off, no octal escapes, no U+FFFD)
    expect(html).toContain('renamed-ü.ts');
    expect(html).not.toContain('\\303');
    expect(html).not.toContain('\uFFFD');

    // --- self-contained: no external resource loads
    expect(html).not.toMatch(/src="https?:/);
    expect(html).not.toMatch(/href="https?:\/\/(?!twitter)/);

    // --- data payload parses and is faithful
    const marker = 'window.__GIT_XRAY_DATA__ = ';
    const start = html.indexOf(marker) + marker.length;
    const end = html.indexOf(';</script>', start);
    const data = JSON.parse(html.slice(start, end === -1 ? html.indexOf(';', start) : end));

    const hotspotPaths = data.hotspots.hotspots.map((h: { filePath: string }) => h.filePath);
    // pre-truncation total present and consistent (0.2.1 display-count fix)
    expect(data.hotspots.totalFileCount).toBeGreaterThanOrEqual(hotspotPaths.length);
    // rename attributed to the NEW path, never a tab-composite "old\tnew"
    expect(hotspotPaths).toContain('renamed-ü.ts');
    expect(hotspotPaths.some((p: string) => p.includes('\t'))).toBe(false);
    // hostile path round-trips exactly
    if (HOSTILE_NAMES) {
      expect(hotspotPaths).toContain(XSS_FILE);
    }

    // both authors present, keyed correctly
    const authorNames = data.contributions.authors.map((a: { name: string }) => a.name);
    expect(authorNames).toContain('Alice Tester');
    expect(authorNames).toContain('Bob $$ Backtick');

    // merge commit detected by PR velocity
    expect(data.prVelocity.available).toBe(true);
    expect(data.prVelocity.totalMerges).toBeGreaterThanOrEqual(1);

    // --- JSON written alongside, valid, and distinct from the HTML
    const json = JSON.parse(await readFile(join(outDir, 'report.json'), 'utf-8'));
    expect(json.contributions.totalCommits).toBeGreaterThanOrEqual(5);
  }, 60_000);

  it('returns exit code 1 and writes no report when the branch does not exist', async () => {
    const output = join(outDir, 'bad-branch.html');
    const exitCode = await runAnalysis(config({ branch: 'no-such-branch', output }));
    expect(exitCode).toBe(1);
    await expect(stat(output)).rejects.toThrow();
  }, 60_000);

  it('creates missing output directories', async () => {
    const output = join(outDir, 'nested', 'deep', 'report.html');
    const exitCode = await runAnalysis(config({ output }));
    expect(exitCode).toBe(0);
    const st = await stat(output);
    expect(st.size).toBeGreaterThan(1000);
  }, 60_000);

  it('never lets --json overwrite the HTML when output lacks an .html suffix', async () => {
    const output = join(outDir, 'no-suffix-report');
    const exitCode = await runAnalysis(config({ output, json: true }));
    expect(exitCode).toBe(0);

    const html = await readFile(output, 'utf-8');
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);

    const json = JSON.parse(await readFile(output + '.json', 'utf-8'));
    expect(json.repoName).toBeTruthy();
  }, 60_000);
});
