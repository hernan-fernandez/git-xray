// Personal mode analyzer
// Computes individual developer stats from commit and file change records

import type { CommitRecord } from '../parsers/log-parser.js';
import type { FileChangeRecord } from '../parsers/numstat-parser.js';

export interface PersonalStats {
  author: string;
  totalCommits: number;
  linesAdded: number;
  linesRemoved: number;
  firstCommit: string;       // ISO date
  lastCommit: string;        // ISO date
  longestStreak: number;     // consecutive days with commits
  busiestDay: string;        // day name
  busiestHour: number;       // 0-23
  topFiles: { filePath: string; changes: number }[];
  topDirectories: { dir: string; changes: number }[];
  impactPercentage: number;  // % of total repo files this author touched
  weekendCommits: number;
  awards: PersonalAward[];
}

export interface PersonalAward {
  icon: string;
  title: string;
  value: string;
}

/**
 * Compute personal stats for a single author.
 */
export function analyzePersonal(
  authorName: string,
  allCommits: CommitRecord[],
  allFileChanges: FileChangeRecord[],
): PersonalStats {
  const myCommits = allCommits.filter(c => c.author === authorName);
  const myFileChanges = allFileChanges.filter(fc => fc.author === authorName);

  // Lines
  const linesAdded = myFileChanges.reduce((sum, fc) => sum + fc.linesAdded, 0);
  const linesRemoved = myFileChanges.reduce((sum, fc) => sum + fc.linesRemoved, 0);

  // Date range
  const dates = myCommits.map(c => c.date).sort((a, b) => a.getTime() - b.getTime());
  const firstCommit = dates.length > 0 ? dates[0].toISOString() : '';
  const lastCommit = dates.length > 0 ? dates[dates.length - 1].toISOString() : '';

  // Longest streak (consecutive days with commits)
  const longestStreak = computeStreak(myCommits);

  // Busiest day and hour
  const dayCounts = [0, 0, 0, 0, 0, 0, 0]; // Sun-Sat
  const hourCounts = new Array(24).fill(0);
  for (const c of myCommits) {
    dayCounts[c.date.getUTCDay()]++;
    hourCounts[c.date.getUTCHours()]++;
  }
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const busiestDayIdx = dayCounts.indexOf(Math.max(...dayCounts));
  const busiestDay = dayNames[busiestDayIdx];
  const busiestHour = hourCounts.indexOf(Math.max(...hourCounts));

  // Weekend commits
  const weekendCommits = dayCounts[0] + dayCounts[6]; // Sun + Sat

  // Top files
  const fileCounts = new Map<string, number>();
  for (const fc of myFileChanges) {
    fileCounts.set(fc.filePath, (fileCounts.get(fc.filePath) ?? 0) + 1);
  }
  const topFiles = Array.from(fileCounts.entries())
    .map(([filePath, changes]) => ({ filePath, changes }))
    .sort((a, b) => b.changes - a.changes)
    .slice(0, 10);

  // Top directories
  const dirCounts = new Map<string, number>();
  for (const fc of myFileChanges) {
    const slashIdx = fc.filePath.indexOf('/');
    const dir = slashIdx >= 0 ? fc.filePath.substring(0, slashIdx) : '.';
    dirCounts.set(dir, (dirCounts.get(dir) ?? 0) + 1);
  }
  const topDirectories = Array.from(dirCounts.entries())
    .map(([dir, changes]) => ({ dir, changes }))
    .sort((a, b) => b.changes - a.changes)
    .slice(0, 5);

  // Impact: % of all unique files in repo that this author touched
  const allFiles = new Set(allFileChanges.map(fc => fc.filePath));
  const myFiles = new Set(myFileChanges.map(fc => fc.filePath));
  const impactPercentage = allFiles.size > 0 ? Math.round((myFiles.size / allFiles.size) * 100) : 0;

  // Awards
  const awards = computeAwards(myCommits, linesAdded, linesRemoved, busiestHour, weekendCommits, longestStreak, topDirectories, impactPercentage);

  return {
    author: authorName,
    totalCommits: myCommits.length,
    linesAdded,
    linesRemoved,
    firstCommit,
    lastCommit,
    longestStreak,
    busiestDay,
    busiestHour,
    topFiles,
    topDirectories,
    impactPercentage,
    weekendCommits,
    awards,
  };
}

function computeStreak(commits: CommitRecord[]): number {
  if (commits.length === 0) return 0;

  // Get unique commit days (YYYY-MM-DD in UTC)
  const days = new Set<string>();
  for (const c of commits) {
    days.add(c.date.toISOString().slice(0, 10));
  }

  const sorted = Array.from(days).sort();
  let maxStreak = 1;
  let current = 1;

  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1]);
    const curr = new Date(sorted[i]);
    const diffDays = (curr.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000);

    if (diffDays === 1) {
      current++;
      maxStreak = Math.max(maxStreak, current);
    } else {
      current = 1;
    }
  }

  return maxStreak;
}

function computeAwards(
  commits: CommitRecord[],
  linesAdded: number,
  linesRemoved: number,
  busiestHour: number,
  weekendCommits: number,
  longestStreak: number,
  topDirs: { dir: string; changes: number }[],
  impactPct: number,
): PersonalAward[] {
  const awards: PersonalAward[] = [];

  // Time-based
  if (busiestHour < 7) {
    awards.push({ icon: '🌅', title: 'Early Bird', value: `Most active at ${busiestHour}:00` });
  } else if (busiestHour >= 22) {
    awards.push({ icon: '🦉', title: 'Night Owl', value: `Most active at ${busiestHour}:00` });
  }

  if (weekendCommits > 0) {
    const pct = commits.length > 0 ? Math.round((weekendCommits / commits.length) * 100) : 0;
    awards.push({ icon: '📅', title: 'Weekend Warrior', value: `${weekendCommits} weekend commits (${pct}%)` });
  }

  // Streak
  if (longestStreak >= 7) {
    awards.push({ icon: '🔥', title: 'Streak Master', value: `${longestStreak} consecutive days` });
  } else if (longestStreak >= 3) {
    awards.push({ icon: '⚡', title: 'On a Roll', value: `${longestStreak} day streak` });
  }

  // Code style
  if (linesRemoved > linesAdded && linesRemoved > 0) {
    awards.push({ icon: '🧹', title: 'The Deleter', value: `Removed ${(linesRemoved - linesAdded).toLocaleString()} net lines` });
  } else if (linesAdded > linesRemoved * 3) {
    awards.push({ icon: '🏗️', title: 'The Builder', value: `+${linesAdded.toLocaleString()} lines added` });
  }

  // Focus
  if (topDirs.length === 1) {
    awards.push({ icon: '🎯', title: 'Laser Focus', value: `All changes in ${topDirs[0].dir}/` });
  } else if (topDirs.length >= 4) {
    awards.push({ icon: '🌍', title: 'Everywhere', value: `Touched ${topDirs.length} directories` });
  }

  // Impact
  if (impactPct >= 50) {
    awards.push({ icon: '👑', title: 'Major Player', value: `Touched ${impactPct}% of all files` });
  } else if (impactPct >= 20) {
    awards.push({ icon: '💪', title: 'Significant Impact', value: `Touched ${impactPct}% of all files` });
  }

  return awards;
}
