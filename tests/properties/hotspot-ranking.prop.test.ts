// Feature: gitpeek, Property 6: Hotspot ranking correctness
// For any set of NameStatusCommit[], the hotspot list from analyzeHotspots
// (with followRenames=false) should be sorted non-increasing by changeCount,
// and length = min(20, totalFiles).
// **Validates: Requirements 3.2**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { analyzeHotspots, type NameStatusCommit } from '../../src/analyzers/hotspots.js';

const arbHexHash = fc.stringMatching(/^[0-9a-f]{40}$/);
const arbFilePath = fc.stringMatching(/^[a-z]{1,6}\/[a-z]{1,6}\.[a-z]{1,3}$/);
const arbStatus = fc.constantFrom('A', 'M', 'D');

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

describe('Property 6: Hotspot ranking correctness', () => {
  it('top-20 sorted non-increasing by changeCount, length = min(20, totalFiles)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbNameStatusCommit, { minLength: 1, maxLength: 60 }),
        async (commits) => {
          const result = await analyzeHotspots(
            commits,
            { followRenames: false, totalCommits: commits.length },
          );

          // The full returned list should be sorted non-increasing by changeCount
          for (let i = 1; i < result.hotspots.length; i++) {
            expect(result.hotspots[i - 1].changeCount).toBeGreaterThanOrEqual(
              result.hotspots[i].changeCount,
            );
          }

          // Collect distinct file paths (matching dedup logic in computeChangeFrequencies)
          const allFiles = new Set<string>();
          for (const commit of commits) {
            const seenInCommit = new Set<string>();
            for (const file of commit.files) {
              if (!file.filePath || seenInCommit.has(file.filePath)) continue;
              seenInCommit.add(file.filePath);
              allFiles.add(file.filePath);
            }
          }
          const totalFiles = allFiles.size;

          // The top-20 slice should have length = min(20, totalFiles)
          const top20 = result.hotspots.slice(0, 20);
          expect(top20.length).toBe(Math.min(20, totalFiles));
        },
      ),
      { numRuns: 100 },
    );
  });
});
