// Feature: gitpeek, Property 8: Complexity metric computation invariant
// For any set of ls-tree output lines, parseLsTreeOutput should return
// totalSize = sum of blob sizes and totalFiles = count of blob entries.
// **Validates: Requirements 4.2**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseLsTreeOutput } from '../../src/analyzers/complexity.js';

// Generate a valid ls-tree line: "mode type hash    size\tpath"
const arbMode = fc.constantFrom('100644', '100755', '120000');
const arbHash = fc.stringMatching(/^[0-9a-f]{40}$/);
const arbSize = fc.integer({ min: 0, max: 100000 });
const arbPath = fc.stringMatching(/^[a-z]{1,6}\/[a-z]{1,6}\.[a-z]{1,3}$/);

interface LsTreeEntry {
  mode: string;
  type: 'blob' | 'tree';
  hash: string;
  size: number;
  path: string;
}

const arbBlobEntry: fc.Arbitrary<LsTreeEntry> = fc.record({
  mode: arbMode,
  type: fc.constant('blob' as const),
  hash: arbHash,
  size: arbSize,
  path: arbPath,
});

const arbTreeEntry: fc.Arbitrary<LsTreeEntry> = fc.record({
  mode: fc.constant('040000'),
  type: fc.constant('tree' as const),
  hash: arbHash,
  size: fc.constant(0),
  path: fc.stringMatching(/^[a-z]{1,6}$/),
});

function formatLsTreeLine(entry: LsTreeEntry): string {
  const sizeStr = entry.type === 'tree' ? '-' : String(entry.size);
  return `${entry.mode} ${entry.type} ${entry.hash}    ${sizeStr}\t${entry.path}`;
}

describe('Property 8: Complexity metric computation invariant', () => {
  it('totalSize = sum of blob sizes, totalFiles = blob count', () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(arbBlobEntry, arbTreeEntry), { minLength: 0, maxLength: 50 }),
        (entries) => {
          // Build ls-tree output string
          const output = entries.map(formatLsTreeLine).join('\n');

          const result = parseLsTreeOutput(output);

          // Compute expected values from blob entries only
          // Note: parseLsTreeOutput deduplicates by path implicitly (last wins for same path)
          // Actually, looking at the code, it does NOT deduplicate — it counts every blob line.
          // But our generator may produce duplicate paths. Let's compute expected the same way.
          const blobs = entries.filter((e) => e.type === 'blob');
          const expectedTotalFiles = blobs.length;
          const expectedTotalSize = blobs.reduce((sum, e) => sum + e.size, 0);

          expect(result.totalFiles).toBe(expectedTotalFiles);
          expect(result.totalSize).toBe(expectedTotalSize);
        },
      ),
      { numRuns: 100 },
    );
  });
});
