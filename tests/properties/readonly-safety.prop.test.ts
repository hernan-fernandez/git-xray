// Feature: gitpeek, Property 9: Read-only analysis safety
// For any set of CommandFilters, all git command builder functions should never
// produce args containing mutating commands (checkout, reset, merge, rebase,
// commit, stash, clean).
// **Validates: Requirements 4.5, 4.6**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
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
} from '../../src/git/commands.js';

const MUTATING_COMMANDS = [
  'checkout',
  'reset',
  'merge',
  'rebase',
  'commit',
  'stash',
  'clean',
];

function assertNoMutatingCommands(args: string[]): void {
  for (const arg of args) {
    for (const cmd of MUTATING_COMMANDS) {
      // Check if any arg IS a mutating command (as a standalone git subcommand)
      expect(arg).not.toBe(cmd);
    }
  }
}

const arbDate = fc.date({
  min: new Date('2018-01-01T00:00:00Z'),
  max: new Date('2025-01-01T00:00:00Z'),
  noInvalidDate: true,
});

const arbFilters: fc.Arbitrary<CommandFilters> = fc.record({
  since: fc.option(arbDate, { nil: undefined }),
  until: fc.option(arbDate, { nil: undefined }),
  branch: fc.option(fc.stringMatching(/^[a-z]{1,10}$/), { nil: undefined }),
  scope: fc.option(fc.stringMatching(/^[a-z]{1,6}\/[a-z]{1,6}$/), { nil: undefined }),
});

const arbFilePath = fc.stringMatching(/^[a-z]{1,6}\/[a-z]{1,6}\.[a-z]{1,3}$/);
const arbTreeIsh = fc.stringMatching(/^[0-9a-f]{40}$/);
const arbBranch = fc.stringMatching(/^[a-z]{1,10}$/);

describe('Property 9: Read-only analysis safety', () => {
  it('no mutating git commands issued by any command builder', () => {
    fc.assert(
      fc.property(arbFilters, arbFilePath, arbTreeIsh, arbBranch, arbDate, arbDate, (filters, filePath, treeIsh, branch, date1, date2) => {
        // Test all command builders
        assertNoMutatingCommands(contributionLog(filters));
        assertNoMutatingCommands(contributionNumstat(filters));
        assertNoMutatingCommands(hotspotLog(filters));
        assertNoMutatingCommands(hotspotFollowLog(filePath, filters));
        assertNoMutatingCommands(lsTree(treeIsh));
        assertNoMutatingCommands(revListSnapshot(date1, date2, branch));
        assertNoMutatingCommands(mergeLog(filters));
        assertNoMutatingCommands(firstParentLog(filters));
      }),
      { numRuns: 100 },
    );
  });
});
