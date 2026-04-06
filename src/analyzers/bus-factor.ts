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

export interface SinglePointRisk {
  filePath: string;
  soleAuthor: string;
  totalChanges: number;
  authorPercentage: number;  // 0-100, how much of all-time changes this author owns
  firstSeen: string;         // ISO date of earliest change by this author
  lastSeen: string;          // ISO date of latest change by this author
  spanMonths: number;        // how many months between first and last change
}

export interface BusFactorData {
  overall: BusFactorResult;
  perDirectory: Map<string, BusFactorResult>;
  singlePointRisks: SinglePointRisk[];
}

/** Minimum number of total changes for a file to be considered a real risk */
const MIN_RISK_CHANGES = 2;

/** File patterns that are boilerplate / config — not real knowledge silos */
const BOILERPLATE_PATTERNS: RegExp[] = [
  /\.gitignore$/i, /\.npmignore$/i, /\.npmrc$/i, /\.eslintrc/i, /\.prettierrc/i,
  /tsconfig(\.\w+)?\.json$/i, /cdk\.json$/i, /cdk\.context\.json$/i,
  /package-lock\.json$/i, /\/package\.json$/i, /^package\.json$/i,
  /go\.sum$/i, /go\.mod$/i, /requirements\.txt$/i, /requirements-dev\.txt$/i,
  /pom\.xml$/i, /\.csproj$/i, /\.sln$/i,
  /jest\.config\.(js|ts)$/i, /\.snap$/i, /\.gitattributes$/i,
  /\.mergify\.yml$/i, /\.projen\//i, /LICENSE$/i, /NOTICE$/i,
  /\.env\.example$/i, /buildspec\.yml$/i, /DO_NOT_AUTOTEST$/i,
  /source\.bat$/i, /setup\.py$/i, /pyproject\.toml$/i,
  /cdk\.out\.\w+\//i, /\.jar$/i, /\.png$/i, /\.jpg$/i, /\.svg$/i,
];

function isBoilerplate(filePath: string): boolean {
  return BOILERPLATE_PATTERNS.some(p => p.test(filePath));
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
  // We collect rich context: who, how many changes, what percentage, time span
  const fileAuthors = new Map<string, Set<string>>();
  // Track all-time changes per file per author for percentage calculation
  const fileAllTimeChanges = new Map<string, Map<string, { count: number; earliest: Date; latest: Date }>>();

  for (const fc of fileChanges) {
    // Track all-time stats
    let authorStats = fileAllTimeChanges.get(fc.filePath);
    if (!authorStats) {
      authorStats = new Map();
      fileAllTimeChanges.set(fc.filePath, authorStats);
    }
    let stat = authorStats.get(fc.author);
    if (!stat) {
      stat = { count: 0, earliest: fc.date, latest: fc.date };
      authorStats.set(fc.author, stat);
    }
    stat.count++;
    if (fc.date.getTime() < stat.earliest.getTime()) stat.earliest = fc.date;
    if (fc.date.getTime() > stat.latest.getTime()) stat.latest = fc.date;

    // Track recent authors (last 12 months)
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

  const singlePointRisks: SinglePointRisk[] = [];
  for (const [filePath, authors] of fileAuthors) {
    if (authors.size === 1) {
      const allTimeStats = fileAllTimeChanges.get(filePath);
      const totalChanges = allTimeStats
        ? Array.from(allTimeStats.values()).reduce((sum, s) => sum + s.count, 0)
        : 0;

      // Filter out low-signal risks: single-change files and boilerplate
      if (totalChanges < MIN_RISK_CHANGES || isBoilerplate(filePath)) continue;

      const soleAuthor = Array.from(authors)[0];
      const authorStat = allTimeStats?.get(soleAuthor);
      const authorChanges = authorStat?.count ?? 0;
      const authorPercentage = totalChanges > 0 ? Math.round((authorChanges / totalChanges) * 100) : 100;
      const earliest = authorStat?.earliest ?? referenceDate;
      const latest = authorStat?.latest ?? referenceDate;
      const spanMonths = Math.max(0, Math.round(getAgeInMonths(earliest, latest)));

      singlePointRisks.push({
        filePath,
        soleAuthor,
        totalChanges,
        authorPercentage,
        firstSeen: earliest.toISOString(),
        lastSeen: latest.toISOString(),
        spanMonths,
      });
    }
  }

  singlePointRisks.sort((a, b) => b.authorPercentage - a.authorPercentage || b.totalChanges - a.totalChanges);

  return { overall, perDirectory, singlePointRisks };
}
