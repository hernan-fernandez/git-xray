// Feature: gitpeek, Property 19: Scope path filtering correctness
// For any scope path and set of file records, only files whose paths start
// with the scope prefix should be included. Tests parseLsTreeOutput with a
// scope parameter and verifies only scope-prefixed files are counted.
// **Validates: Requirements 10.7**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseLsTreeOutput } from '../../src/analyzers/complexity.js';

// --- Arbitraries ---

const arbHash = fc.stringMatching(/^[0-9a-f]{40}$/);
const arbSize = fc.integer({ min: 1, max: 100000 });

// Generate directory names and file names for constructing paths
const arbDirName = fc.stringMatching(/^[a-z]{2,6}$/);
const arbFileName = fc.stringMatching(/^[a-z]{2,6}\.[a-z]{2,3}$/);

// Generate a file path like "dir/subdir/file.ts"
const arbFilePath = fc
  .tuple(arbDirName, fc.option(arbDirName, { nil: undefined }), arbFileName)
  .map(([dir, subdir, file]) => (subdir ? `${dir}/${subdir}/${file}` : `${dir}/${file}`));

interface LsTreeBlobEntry {
  hash: string;
  size: number;
  path: string;
}

const arbBlobEntry: fc.Arbitrary<LsTreeBlobEntry> = fc.record({
  hash: arbHash,
  size: arbSize,
  path: arbFilePath,
});

function formatLsTreeLine(entry: LsTreeBlobEntry): string {
  return `100644 blob ${entry.hash}    ${entry.size}\t${entry.path}`;
}

describe('Property 19: Scope path filtering correctness', () => {
  it('only scope-prefixed files are included in parseLsTreeOutput results', () => {
    fc.assert(
      fc.property(
        arbDirName,
        fc.array(arbBlobEntry, { minLength: 1, maxLength: 50 }),
        (scopeDir, entries) => {
          const scope = `${scopeDir}/`;
          const output = entries.map(formatLsTreeLine).join('\n');

          const result = parseLsTreeOutput(output, scope);

          // Compute expected: only blobs whose path starts with scope
          const matchingEntries = entries.filter((e) => e.path.startsWith(scope));
          const expectedFiles = matchingEntries.length;
          const expectedSize = matchingEntries.reduce((sum, e) => sum + e.size, 0);

          expect(result.totalFiles).toBe(expectedFiles);
          expect(result.totalSize).toBe(expectedSize);
        },
      ),
      { numRuns: 100 },
    );
  });
});
