import { describe, it, expect } from 'vitest';
import {
  contributionLog,
  contributionNumstat,
  hotspotLog,
  hotspotFollowLog,
  lsTree,
  revListSnapshot,
  mergeLog,
  firstParentLog,
  type CommandFilters,
} from '../../../src/git/commands.js';

describe('Git command builders', () => {
  const emptyFilters: CommandFilters = {};
  const fullFilters: CommandFilters = {
    since: new Date('2024-01-01T00:00:00Z'),
    until: new Date('2024-12-31T23:59:59Z'),
    branch: 'main',
    scope: 'src/',
  };

  describe('contributionLog', () => {
    it('should build basic contribution log args', () => {
      const args = contributionLog(emptyFilters);
      expect(args).toContain('log');
      expect(args).toContain('--format=%H|%aN|%aE|%aI|%s|%P');
    });

    it('should use mailmap-resolved format specifiers (%aN, %aE)', () => {
      const args = contributionLog(emptyFilters);
      const format = args.find(a => a.startsWith('--format='))!;
      expect(format).toContain('%aN');
      expect(format).toContain('%aE');
      expect(format).not.toContain('%an|');
      expect(format).not.toContain('%ae|');
    });

    it('should apply all filters', () => {
      const args = contributionLog(fullFilters);
      expect(args.some(a => a.startsWith('--since='))).toBe(true);
      expect(args.some(a => a.startsWith('--until='))).toBe(true);
      expect(args).toContain('main');
      expect(args).toContain('--');
      expect(args).toContain('src/');
    });
  });

  describe('contributionNumstat', () => {
    it('should build numstat log args with mailmap-resolved format', () => {
      const args = contributionNumstat(emptyFilters);
      expect(args).toContain('log');
      expect(args).toContain('--numstat');
      const format = args.find(a => a.startsWith('--format='))!;
      expect(format).toContain('%aN');
    });

    it('should apply scope filter', () => {
      const args = contributionNumstat({ scope: 'lib/' });
      expect(args).toContain('--');
      expect(args).toContain('lib/');
    });
  });

  describe('hotspotLog', () => {
    it('should build hotspot log args', () => {
      const args = hotspotLog(emptyFilters);
      expect(args).toContain('log');
      expect(args).toContain('--name-status');
      expect(args).toContain('--format=%H');
    });

    it('should apply filters and scope', () => {
      const args = hotspotLog(fullFilters);
      expect(args.some(a => a.startsWith('--since='))).toBe(true);
      expect(args).toContain('--');
      expect(args).toContain('src/');
    });
  });

  describe('hotspotFollowLog', () => {
    it('should build follow log args for a specific file', () => {
      const args = hotspotFollowLog('src/index.ts', emptyFilters);
      expect(args).toContain('log');
      expect(args).toContain('--follow');
      expect(args).toContain('--name-only');
      expect(args).toContain('--');
      expect(args).toContain('src/index.ts');
    });

    it('should apply date and branch filters', () => {
      const args = hotspotFollowLog('file.ts', fullFilters);
      expect(args.some(a => a.startsWith('--since='))).toBe(true);
      expect(args.some(a => a.startsWith('--until='))).toBe(true);
      expect(args).toContain('main');
      expect(args).toContain('--');
      expect(args).toContain('file.ts');
    });
  });

  describe('lsTree', () => {
    it('should build ls-tree args', () => {
      const args = lsTree('HEAD');
      expect(args).toEqual(['ls-tree', '-r', '-l', 'HEAD']);
    });

    it('should accept any tree-ish', () => {
      const args = lsTree('abc123');
      expect(args[3]).toBe('abc123');
    });
  });

  describe('revListSnapshot', () => {
    it('should build rev-list args with date range and branch', () => {
      const after = new Date('2024-01-01T00:00:00Z');
      const before = new Date('2024-02-01T00:00:00Z');
      const args = revListSnapshot(after, before, 'main');
      expect(args[0]).toBe('rev-list');
      expect(args.some(a => a.startsWith('--after='))).toBe(true);
      expect(args.some(a => a.startsWith('--before='))).toBe(true);
      expect(args).toContain('-1');
      expect(args).toContain('main');
    });
  });

  describe('mergeLog', () => {
    it('should build merge log args with mailmap-resolved format', () => {
      const args = mergeLog(emptyFilters);
      expect(args).toContain('log');
      expect(args).toContain('--merges');
      expect(args).toContain('--format=%H|%aI|%P|%s');
    });

    it('should apply filters', () => {
      const args = mergeLog(fullFilters);
      expect(args.some(a => a.startsWith('--since='))).toBe(true);
      expect(args).toContain('main');
    });
  });

  describe('firstParentLog', () => {
    it('should build first-parent log args', () => {
      const args = firstParentLog(emptyFilters);
      expect(args).toContain('log');
      expect(args).toContain('--first-parent');
      expect(args).toContain('--format=%H');
    });

    it('should apply date and branch filters but not scope', () => {
      const args = firstParentLog(fullFilters);
      expect(args.some(a => a.startsWith('--since='))).toBe(true);
      expect(args).toContain('main');
      // first-parent log doesn't use scope (it's for main-line commit set)
      expect(args).not.toContain('--');
    });
  });

  describe('filter application', () => {
    it('should not add filters when none provided', () => {
      const args = contributionLog(emptyFilters);
      expect(args.some(a => a.startsWith('--since='))).toBe(false);
      expect(args.some(a => a.startsWith('--until='))).toBe(false);
      expect(args).not.toContain('--');
    });

    it('should handle partial filters (only since)', () => {
      const args = contributionLog({ since: new Date('2024-06-01T00:00:00Z') });
      expect(args.some(a => a.startsWith('--since='))).toBe(true);
      expect(args.some(a => a.startsWith('--until='))).toBe(false);
    });
  });
});
