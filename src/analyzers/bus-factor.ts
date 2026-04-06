// Bus factor calculation
// Pure function: (commits, fileChanges, referenceDate) => BusFactorData

import type { CommitRecord } from '../parsers/log-parser.js';
import type { FileChangeRecord } from '../parsers/numstat-parser.js';
import { timeDecayWeight, getAgeInMonths } from '../utils/time-decay.js';

export interface BusFactorResult {
  scope: string;
  busFactor: number;
  topAuthors: { name: string; weightedCommits: number }[];
}

export interface BusFactorData {
  overall: BusFactorResult;
  perDirectory: Map<string, BusFactorResult>;
  singlePointRisks: string[];
}

/**
 * Compute bus factor for a given scope from weighted author commit counts.
 *
 * Bus factor N = minimum number of top authors whose weighted commits
 * sum to >= 50% of total weighted commits.
 */
function computeBusFactor(
  authorWeights: Map<string, number>,
  scope: string,
): BusFactorResult {
  if (authorWeights.size === 0) {
    return { scope, busFactor: 0, topAuthors: [] };
  }

  const sorted = Array.from(authorWeights.entries())
    .map(([name, weightedCommits]) => ({ name, weightedCommits }))
    .sort((a, b) => b.weightedCommits - a.weightedCommits);

  const total = sorted.reduce((sum, a) => sum + a.weightedCommits, 0);
  const threshold = total * 0.5;

  let cumulative = 0;
  let busFactor = 0;
  for (const author of sorted) {
    cumulative += author.weightedCommits;
    busFactor++;
    if (cumulative >= threshold) break;
  }

  return { scope, busFactor, topAuthors: sorted };
}

/**
 * Get the top-level directory from a file path.
 * e.g. "src/utils/foo.ts" → "src", "README.md" → "."
 */
function getTopLevelDir(filePath: string): string {
  const slashIdx = filePath.indexOf('/');
  if (slashIdx === -1) return '.';
  return filePath.substring(0, slashIdx);
}

/**
 * Analyze bus factor for the repository.
 *
 * @param commits - Parsed commit records (author identity resolved via .mailmap through %aN/%aE)
 * @param fileChanges - Parsed file change records
 * @param referenceDate - The --until date or current system time
 */
export function analyzeBusFactor(
  commits: CommitRecord[],
  fileChanges: FileChangeRecord[],
  referenceDate: Date,
): BusFactorData {
  // --- Overall bus factor: weighted commit counts per author ---
  const overallWeights = new Map<string, number>();

  for (const commit of commits) {
    const weight = timeDecayWeight(commit.date, referenceDate);
    overallWeights.set(
      commit.author,
      (overallWeights.get(commit.author) ?? 0) + weight,
    );
  }

  const overall = computeBusFactor(overallWeights, 'overall');

  // --- Per-directory bus factor ---
  // Build a map: directory → (author → weighted commit count)
  // We derive directory from file change records
  const dirAuthorWeights = new Map<string, Map<string, number>>();

  for (const fc of fileChanges) {
    const dir = getTopLevelDir(fc.filePath);
    let authorMap = dirAuthorWeights.get(dir);
    if (!authorMap) {
      authorMap = new Map<string, number>();
      dirAuthorWeights.set(dir, authorMap);
    }

    // Find the commit to get its weight
    const weight = timeDecayWeight(fc.date, referenceDate);
    authorMap.set(fc.author, (authorMap.get(fc.author) ?? 0) + weight);
  }

  const perDirectory = new Map<string, BusFactorResult>();
  for (const [dir, authorMap] of dirAuthorWeights) {
    perDirectory.set(dir, computeBusFactor(authorMap, dir));
  }

  // --- Single-point-of-knowledge risks ---
  // Files with exactly 1 distinct author in the last 12 months (relative to referenceDate)
  const fileAuthors = new Map<string, Set<string>>();

  for (const fc of fileChanges) {
    const ageMonths = getAgeInMonths(fc.date, referenceDate);
    if (ageMonths <= 12) {
      let authors = fileAuthors.get(fc.filePath);
      if (!authors) {
        authors = new Set<string>();
        fileAuthors.set(fc.filePath, authors);
      }
      authors.add(fc.author);
    }
  }

  const singlePointRisks: string[] = [];
  for (const [filePath, authors] of fileAuthors) {
    if (authors.size === 1) {
      singlePointRisks.push(filePath);
    }
  }

  singlePointRisks.sort();

  return { overall, perDirectory, singlePointRisks };
}
