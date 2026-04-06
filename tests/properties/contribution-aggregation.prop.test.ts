// Feature: gitpeek, Property 2: Contribution aggregation invariant
// For any set of CommitRecord[] and FileChangeRecord[], the sum of per-author
// commit counts should equal totalCommits, and the sum of per-author linesAdded/
// linesRemoved should equal the global totals from fileChanges.
// **Validates: Requirements 2.1**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { analyzeContributions } from '../../src/analyzers/contributions.js';
import type { CommitRecord } from '../../src/parsers/log-parser.js';
import type { FileChangeRecord } from '../../src/parsers/numstat-parser.js';

// --- Arbitraries ---

const arbAuthorName = fc.stringMatching(/^[A-Za-z ]{1,20}$/);
const arbEmail = fc.stringMatching(/^[a-z]{1,8}@[a-z]{1,8}\.[a-z]{2,3}$/);
const arbHexHash = fc.stringMatching(/^[0-9a-f]{40}$/);
const arbDate = fc.date({ min: new Date('2020-01-01T00:00:00Z'), max: new Date('2025-01-01T00:00:00Z'), noInvalidDate: true });
const arbMessage = fc.string({ minLength: 1, maxLength: 50 });

const arbCommitRecord: fc.Arbitrary<CommitRecord> = fc.record({
  hash: arbHexHash,
  author: arbAuthorName,
  email: arbEmail,
  date: arbDate,
  message: arbMessage,
  isMerge: fc.boolean(),
  parentHashes: fc.array(arbHexHash, { minLength: 0, maxLength: 2 }),
});

const arbFilePath = fc.stringMatching(/^[a-z]{1,8}\/[a-z]{1,8}\.[a-z]{1,4}$/);

const arbFileChangeRecord: fc.Arbitrary<FileChangeRecord> = fc.record({
  commitHash: arbHexHash,
  filePath: arbFilePath,
  linesAdded: fc.nat({ max: 500 }),
  linesRemoved: fc.nat({ max: 500 }),
  author: arbAuthorName,
  date: arbDate,
});

describe('Property 2: Contribution aggregation invariant', () => {
  it('per-author commit count sums equal totalCommits', () => {
    fc.assert(
      fc.property(
        fc.array(arbCommitRecord, { minLength: 0, maxLength: 50 }),
        fc.array(arbFileChangeRecord, { minLength: 0, maxLength: 50 }),
        (commits, fileChanges) => {
          const result = analyzeContributions(commits, fileChanges, commits.length + 1);

          // Sum of per-author commit counts should equal totalCommits
          const sumCommits = result.authors.reduce((acc, a) => acc + a.commits, 0);
          expect(sumCommits).toBe(result.totalCommits);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('per-author line sums equal global totals from fileChanges', () => {
    fc.assert(
      fc.property(
        fc.array(arbCommitRecord, { minLength: 0, maxLength: 50 }),
        fc.array(arbFileChangeRecord, { minLength: 0, maxLength: 50 }),
        (commits, fileChanges) => {
          // Use a large topN to get all authors
          const result = analyzeContributions(commits, fileChanges, commits.length + fileChanges.length + 1);

          const globalLinesAdded = fileChanges.reduce((acc, fc) => acc + fc.linesAdded, 0);
          const globalLinesRemoved = fileChanges.reduce((acc, fc) => acc + fc.linesRemoved, 0);

          const sumLinesAdded = result.authors.reduce((acc, a) => acc + a.linesAdded, 0);
          const sumLinesRemoved = result.authors.reduce((acc, a) => acc + a.linesRemoved, 0);

          expect(sumLinesAdded).toBe(globalLinesAdded);
          expect(sumLinesRemoved).toBe(globalLinesRemoved);
        },
      ),
      { numRuns: 100 },
    );
  });
});
