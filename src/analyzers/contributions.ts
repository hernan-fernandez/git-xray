// Contribution pattern analysis
// Pure function: (commits, fileChanges, topN?) => ContributionData

import type { CommitRecord } from '../parsers/log-parser.js';
import type { FileChangeRecord } from '../parsers/numstat-parser.js';

export interface AuthorSummary {
  name: string;
  email: string;
  commits: number;
  linesAdded: number;
  linesRemoved: number;
}

export interface ContributionData {
  authors: AuthorSummary[];
  heatmap: number[][];          // [dayOfWeek][hourOfDay] -> commit count (7x24)
  totalCommits: number;
  totalAuthors: number;         // actual count before truncation
}

/**
 * Analyze contribution patterns from commit records and file change records.
 *
 * - Computes per-author commit counts (keyed by author name)
 * - Aggregates per-author lines added/removed from file changes
 * - Builds a 7×24 heatmap (dayOfWeek × hourOfDay) from commit dates
 * - Returns top-N contributors sorted by commit count descending
 *
 * @param commits - Parsed commit records
 * @param fileChanges - Parsed file change records
 * @param topN - Number of top contributors to return (default 10)
 */
export function analyzeContributions(
  commits: CommitRecord[],
  fileChanges: FileChangeRecord[],
  topN: number = 10,
): ContributionData {
  // Build 7x24 zero-filled heatmap
  const heatmap: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));

  // Track per-author data keyed by author name
  const authorMap = new Map<string, AuthorSummary>();

  for (const commit of commits) {
    // Aggregate commit count per author
    let summary = authorMap.get(commit.author);
    if (!summary) {
      summary = {
        name: commit.author,
        email: commit.email,
        commits: 0,
        linesAdded: 0,
        linesRemoved: 0,
      };
      authorMap.set(commit.author, summary);
    }
    summary.commits++;

    // Populate heatmap cell
    const day = commit.date.getUTCDay();    // 0=Sunday..6=Saturday
    const hour = commit.date.getUTCHours(); // 0-23
    heatmap[day][hour]++;
  }

  // Aggregate lines added/removed from file changes
  for (const fc of fileChanges) {
    let summary = authorMap.get(fc.author);
    if (!summary) {
      // Author appears in file changes but not in commits — create entry
      summary = {
        name: fc.author,
        email: '',
        commits: 0,
        linesAdded: 0,
        linesRemoved: 0,
      };
      authorMap.set(fc.author, summary);
    }
    summary.linesAdded += fc.linesAdded;
    summary.linesRemoved += fc.linesRemoved;
  }

  // Sort by commit count descending, take top-N
  const allAuthors = Array.from(authorMap.values());
  allAuthors.sort((a, b) => b.commits - a.commits);
  const authors = allAuthors.slice(0, topN);

  return {
    authors,
    heatmap,
    totalCommits: commits.length,
    totalAuthors: allAuthors.length,
  };
}
