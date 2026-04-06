// Feature: gitpeek, Property 12: Single-point-of-knowledge detection
// For any set of FileChangeRecord[] and a reference date, a file should appear
// in singlePointRisks iff it has exactly 1 distinct author in the last 12 months.
// **Validates: Requirements 5.5**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { analyzeBusFactor } from '../../src/analyzers/bus-factor.js';
import { getAgeInMonths } from '../../src/utils/time-decay.js';
import type { CommitRecord } from '../../src/parsers/log-parser.js';
import type { FileChangeRecord } from '../../src/parsers/numstat-parser.js';

const referenceDate = new Date('2025-01-15T00:00:00Z');

const arbAuthorName = fc.stringMatching(/^[A-Za-z]{2,8}$/);
const arbFilePath = fc.stringMatching(/^[a-z]{1,6}\/[a-z]{1,6}\.[a-z]{1,3}$/);

// Generate file change records with controlled dates and authors
const arbFileChange = fc.record({
  filePath: arbFilePath,
  author: arbAuthorName,
  // Dates within 18 months before reference date (some within 12, some outside)
  monthsAgo: fc.integer({ min: 0, max: 18 }),
  linesAdded: fc.nat({ max: 100 }),
  linesRemoved: fc.nat({ max: 100 }),
});

/**
 * Create a date that is `monthsAgo` calendar months before the reference date,
 * using UTC to avoid timezone issues.
 */
function dateMonthsAgo(monthsAgo: number, ref: Date): Date {
  return new Date(Date.UTC(
    ref.getUTCFullYear(),
    ref.getUTCMonth() - monthsAgo,
    ref.getUTCDate(),
  ));
}

describe('Property 12: Single-point-of-knowledge detection', () => {
  it('file in singlePointRisks iff exactly 1 author in last 12 months', () => {
    fc.assert(
      fc.property(
        fc.array(arbFileChange, { minLength: 1, maxLength: 40 }),
        (fileChanges) => {
          // Build FileChangeRecord[] with dates relative to referenceDate
          let hashCounter = 0;
          const records: FileChangeRecord[] = fileChanges.map((fc) => {
            const date = dateMonthsAgo(fc.monthsAgo, referenceDate);
            const hash = (hashCounter++).toString(16).padStart(40, '0');
            return {
              commitHash: hash,
              filePath: fc.filePath,
              linesAdded: fc.linesAdded,
              linesRemoved: fc.linesRemoved,
              author: fc.author,
              date,
            };
          });

          // Build minimal commit records
          const commits: CommitRecord[] = records.map((r) => ({
            hash: r.commitHash,
            author: r.author,
            email: `${r.author.toLowerCase()}@test.com`,
            date: r.date,
            message: 'commit',
            isMerge: false,
            parentHashes: [],
          }));

          const result = analyzeBusFactor(commits, records, referenceDate);

          // Compute expected: files with exactly 1 recent author,
          // at least 2 total changes, and not boilerplate
          const fileAuthorsLast12 = new Map<string, Set<string>>();
          const fileTotalChanges = new Map<string, number>();
          for (const r of records) {
            fileTotalChanges.set(r.filePath, (fileTotalChanges.get(r.filePath) ?? 0) + 1);
            const ageMonths = getAgeInMonths(r.date, referenceDate);
            if (ageMonths <= 12) {
              let authors = fileAuthorsLast12.get(r.filePath);
              if (!authors) {
                authors = new Set<string>();
                fileAuthorsLast12.set(r.filePath, authors);
              }
              authors.add(r.author);
            }
          }

          const expectedRisks = new Set<string>();
          for (const [filePath, authors] of fileAuthorsLast12) {
            const totalChanges = fileTotalChanges.get(filePath) ?? 0;
            if (authors.size === 1 && totalChanges >= 2) {
              expectedRisks.add(filePath);
            }
          }

          const actualRisks = new Set(result.singlePointRisks.map(r => r.filePath));

          // Bidirectional check: actual ↔ expected
          for (const file of actualRisks) {
            expect(expectedRisks.has(file)).toBe(true);
          }
          for (const file of expectedRisks) {
            expect(actualRisks.has(file)).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
