// Feature: gitpeek, Property 5: File change frequency correctness
// For any set of file change records, the computed change frequency for each file
// should equal the number of distinct commit hashes that modified that file.
// **Validates: Requirements 3.1**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { computeChangeFrequencies, type NameStatusCommit } from '../../src/analyzers/hotspots.js';

const arbHexHash = fc.stringMatching(/^[0-9a-f]{40}$/);
const arbFilePath = fc.stringMatching(/^[a-z]{1,6}\/[a-z]{1,6}\.[a-z]{1,3}$/);
const arbStatus = fc.constantFrom('A', 'M', 'D', 'R');

const arbNameStatusCommit: fc.Arbitrary<NameStatusCommit> = fc.record({
  commitHash: arbHexHash,
  files: fc.array(
    fc.record({
      status: arbStatus,
      filePath: arbFilePath,
    }),
    { minLength: 1, maxLength: 10 },
  ),
});

describe('Property 5: File change frequency correctness', () => {
  it('change frequency equals distinct commit count per file', () => {
    fc.assert(
      fc.property(
        fc.array(arbNameStatusCommit, { minLength: 1, maxLength: 50 }),
        (commits) => {
          const result = computeChangeFrequencies(commits);

          // Compute expected frequencies: for each file, count distinct commits
          const expected = new Map<string, Set<string>>();
          for (const commit of commits) {
            const seenInCommit = new Set<string>();
            for (const file of commit.files) {
              if (!file.filePath || seenInCommit.has(file.filePath)) continue;
              seenInCommit.add(file.filePath);

              if (!expected.has(file.filePath)) {
                expected.set(file.filePath, new Set());
              }
              expected.get(file.filePath)!.add(commit.commitHash);
            }
          }

          // Verify each file's change count matches distinct commit count
          for (const [filePath, commitSet] of expected) {
            const entry = result.get(filePath);
            expect(entry).toBeDefined();
            expect(entry!.changeCount).toBe(commitSet.size);
          }

          // Verify no extra files in result
          expect(result.size).toBe(expected.size);
        },
      ),
      { numRuns: 100 },
    );
  });
});
