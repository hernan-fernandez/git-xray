// Feature: gitpeek, Property 20: Invalid scope rejection
// For any scope path that doesn't match any file in a set of file records,
// parseLsTreeOutput should return zero files. Tests that a non-matching scope
// produces an empty result.
// **Validates: Requirements 10.8**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseLsTreeOutput } from '../../src/analyzers/complexity.js';

// --- Arbitraries ---

const arbHash = fc.stringMatching(/^[0-9a-f]{40}$/);
const arbSize = fc.integer({ min: 1, max: 100000 });

// File entries always under "src/" prefix
const arbSrcFileName = fc.stringMatching(/^[a-z]{2,6}\.[a-z]{2,3}$/);
const arbSrcPath = arbSrcFileName.map((f) => `src/${f}`);

interface LsTreeBlobEntry {
  hash: string;
  size: number;
  path: string;
}

const arbBlobEntry: fc.Arbitrary<LsTreeBlobEntry> = fc.record({
  hash: arbHash,
  size: arbSize,
  path: arbSrcPath,
});

function formatLsTreeLine(entry: LsTreeBlobEntry): string {
  return `100644 blob ${entry.hash}    ${entry.size}\t${entry.path}`;
}

// Generate a scope that will never match "src/" paths
// Use a prefix guaranteed to differ: "nonexistent-<random>/"
const arbNonMatchingScope = fc.stringMatching(/^[A-Z]{3,8}$/).map((s) => `${s}/`);

describe('Property 20: Invalid scope rejection', () => {
  it('non-existent scope produces zero files from parseLsTreeOutput', () => {
    fc.assert(
      fc.property(
        arbNonMatchingScope,
        fc.array(arbBlobEntry, { minLength: 1, maxLength: 50 }),
        (scope, entries) => {
          const output = entries.map(formatLsTreeLine).join('\n');

          const result = parseLsTreeOutput(output, scope);

          // No files should match since all paths start with "src/" and scope is uppercase
          expect(result.totalFiles).toBe(0);
          expect(result.totalSize).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
