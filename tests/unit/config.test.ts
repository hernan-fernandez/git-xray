import { describe, it, expect } from 'vitest';
import { parseConfig, ConfigError } from '../../src/config.js';

// Helper: simulate process.argv with node + script prefix
function argv(...args: string[]): string[] {
  return ['node', 'gitpeek', ...args];
}

describe('parseConfig', () => {
  it('returns defaults when no flags are provided', () => {
    const config = parseConfig(argv());
    expect(config.repoPath).toBe(process.cwd());
    expect(config.output).toBe('./gitpeek-report.html');
    expect(config.followRenames).toBe(false);
    expect(config.noOpen).toBe(false);
    expect(config.noColor).toBe(false);
    expect(config.json).toBe(false);
    expect(config.branch).toBeUndefined();
    expect(config.since).toBeUndefined();
    expect(config.until).toBeUndefined();
    expect(config.scope).toBeUndefined();
  });

  it('parses a positional repo path', () => {
    const config = parseConfig(argv('/some/repo'));
    expect(config.repoPath).toBe('/some/repo');
  });

  it('parses --branch flag', () => {
    const config = parseConfig(argv('--branch', 'main'));
    expect(config.branch).toBe('main');
  });

  it('parses --branch=value form', () => {
    const config = parseConfig(argv('--branch=develop'));
    expect(config.branch).toBe('develop');
  });

  it('parses --since flag with a valid date', () => {
    const config = parseConfig(argv('--since', '2024-01-01'));
    expect(config.since).toBeInstanceOf(Date);
    expect(config.since!.toISOString()).toContain('2024-01-01');
  });

  it('parses --until flag with a valid date', () => {
    const config = parseConfig(argv('--until', '2024-06-30'));
    expect(config.until).toBeInstanceOf(Date);
    expect(config.until!.toISOString()).toContain('2024-06-30');
  });

  it('parses --scope flag', () => {
    const config = parseConfig(argv('--scope', 'src/lib'));
    expect(config.scope).toBe('src/lib');
  });

  it('parses --output flag', () => {
    const config = parseConfig(argv('--output', 'report.html'));
    expect(config.output).toBe('report.html');
  });

  it('parses boolean flags', () => {
    const config = parseConfig(argv('--no-open', '--no-color', '--json', '--follow-renames'));
    expect(config.noOpen).toBe(true);
    expect(config.noColor).toBe(true);
    expect(config.json).toBe(true);
    expect(config.followRenames).toBe(true);
  });

  it('parses multiple flags together with a positional path', () => {
    const config = parseConfig(argv('--branch', 'main', '--json', '/my/repo'));
    expect(config.branch).toBe('main');
    expect(config.json).toBe(true);
    expect(config.repoPath).toBe('/my/repo');
  });

  it('throws ConfigError for unrecognized flags', () => {
    expect(() => parseConfig(argv('--unknown'))).toThrow(ConfigError);
    expect(() => parseConfig(argv('--unknown'))).toThrow(/Unknown flag: --unknown/);
  });

  it('throws ConfigError for invalid --since date', () => {
    expect(() => parseConfig(argv('--since', 'not-a-date'))).toThrow(ConfigError);
    expect(() => parseConfig(argv('--since', 'not-a-date'))).toThrow(/Invalid date/);
  });

  it('throws ConfigError for invalid --until date', () => {
    expect(() => parseConfig(argv('--until', 'garbage'))).toThrow(ConfigError);
  });

  it('throws ConfigError when --branch has no value', () => {
    expect(() => parseConfig(argv('--branch'))).toThrow(ConfigError);
    expect(() => parseConfig(argv('--branch'))).toThrow(/--branch requires/);
  });

  it('throws ConfigError when --scope has no value', () => {
    expect(() => parseConfig(argv('--scope'))).toThrow(ConfigError);
  });

  it('throws ConfigError when --output has no value', () => {
    expect(() => parseConfig(argv('--output'))).toThrow(ConfigError);
  });

  it('includes help text in error for unrecognized flags', () => {
    try {
      parseConfig(argv('--foo'));
    } catch (e) {
      expect((e as Error).message).toContain('Usage: gitpeek');
    }
  });
});
