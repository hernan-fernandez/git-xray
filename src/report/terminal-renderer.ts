// Terminal report renderer
// Builds a formatted string with Unicode box-drawing, sparklines, and colored text.
// Uses chalk for ANSI colors; respects noColor flag via chalk level 0.

import { Chalk } from 'chalk';
import type { ReportData } from './aggregator.js';
import { sparkline } from '../utils/sparkline.js';

type ChalkInstance = InstanceType<typeof Chalk>;

// Box-drawing characters
const BOX = {
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '─',
  vertical: '│',
  teeRight: '├',
  teeLeft: '┤',
  teeDown: '┬',
  teeUp: '┴',
  cross: '┼',
} as const;

/**
 * Pad or truncate a string to a fixed width.
 */
function pad(str: string, width: number): string {
  if (str.length >= width) return str.slice(0, width);
  return str + ' '.repeat(width - str.length);
}

/**
 * Right-align a string within a fixed width.
 */
function padLeft(str: string, width: number): string {
  if (str.length >= width) return str.slice(0, width);
  return ' '.repeat(width - str.length) + str;
}

/**
 * Draw a horizontal rule with box-drawing characters.
 */
function horizontalRule(left: string, mid: string, right: string, widths: number[]): string {
  return left + widths.map((w) => BOX.horizontal.repeat(w + 2)).join(mid) + right;
}

/**
 * Draw a table row with box-drawing characters.
 */
function tableRow(cells: string[], widths: number[]): string {
  const inner = cells.map((cell, i) => ' ' + pad(cell, widths[i]) + ' ').join(BOX.vertical);
  return BOX.vertical + inner + BOX.vertical;
}

/**
 * Format milliseconds as a human-readable duration.
 */
function formatDuration(ms: number): string {
  const hours = ms / (1000 * 60 * 60);
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = hours / 24;
  return `${days.toFixed(1)}d`;
}

/**
 * Render a section header with optional underline.
 */
function sectionHeader(chalk: ChalkInstance, title: string): string {
  return '\n' + chalk.bold.cyan(`═══ ${title} ═══`) + '\n';
}

/**
 * Render the Contributors section.
 */
function renderContributors(chalk: ChalkInstance, data: ReportData): string {
  const lines: string[] = [];
  lines.push(sectionHeader(chalk, 'Contributors'));

  const authors = data.contributions.authors;
  if (authors.length === 0) {
    lines.push('  No contributors found.\n');
    return lines.join('\n');
  }

  const colWidths = [20, 8, 10, 10];
  lines.push(horizontalRule(BOX.topLeft, BOX.teeDown, BOX.topRight, colWidths));
  lines.push(tableRow([
    chalk.bold('Author'),
    chalk.bold('Commits'),
    chalk.bold('Added'),
    chalk.bold('Removed'),
  ], colWidths));
  lines.push(horizontalRule(BOX.teeRight, BOX.cross, BOX.teeLeft, colWidths));

  for (const author of authors) {
    lines.push(tableRow([
      author.name,
      String(author.commits),
      chalk.green('+' + author.linesAdded),
      chalk.red('-' + author.linesRemoved),
    ], colWidths));
  }

  lines.push(horizontalRule(BOX.bottomLeft, BOX.teeUp, BOX.bottomRight, colWidths));
  lines.push(`  Total commits: ${chalk.bold(String(data.contributions.totalCommits))}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Render the Hotspots section.
 */
function renderHotspots(chalk: ChalkInstance, data: ReportData): string {
  const lines: string[] = [];
  lines.push(sectionHeader(chalk, 'Code Hotspots'));

  const hotspots = data.hotspots.hotspots;
  if (hotspots.length === 0) {
    lines.push('  No hotspots found.\n');
    return lines.join('\n');
  }

  const colWidths = [40, 8, 8];
  lines.push(horizontalRule(BOX.topLeft, BOX.teeDown, BOX.topRight, colWidths));
  lines.push(tableRow([
    chalk.bold('File'),
    chalk.bold('Changes'),
    chalk.bold('Authors'),
  ], colWidths));
  lines.push(horizontalRule(BOX.teeRight, BOX.cross, BOX.teeLeft, colWidths));

  for (const hotspot of hotspots) {
    lines.push(tableRow([
      hotspot.filePath,
      String(hotspot.changeCount),
      String(hotspot.uniqueAuthors),
    ], colWidths));
  }

  lines.push(horizontalRule(BOX.bottomLeft, BOX.teeUp, BOX.bottomRight, colWidths));
  lines.push('');

  return lines.join('\n');
}

/**
 * Render the Complexity Trend section with sparkline.
 */
function renderComplexityTrend(chalk: ChalkInstance, data: ReportData): string {
  const lines: string[] = [];
  lines.push(sectionHeader(chalk, 'Complexity Trend'));

  const snapshots = data.complexity.snapshots;
  if (snapshots.length === 0) {
    lines.push('  No complexity data available.\n');
    return lines.join('\n');
  }

  const sizes = snapshots.map((s) => s.totalSize);
  const spark = sparkline(sizes);
  lines.push(`  Complexity: ${spark}  (${data.complexity.interval} intervals)`);

  const first = snapshots[0];
  const last = snapshots[snapshots.length - 1];
  lines.push(`  Files: ${chalk.bold(String(first.totalFiles))} → ${chalk.bold(String(last.totalFiles))}`);
  lines.push(`  Size:  ${chalk.bold(String(first.totalSize))} → ${chalk.bold(String(last.totalSize))}`);
  lines.push('');

  return lines.join('\n');
}

/**
 * Render the Bus Factor section.
 */
function renderBusFactor(chalk: ChalkInstance, data: ReportData): string {
  const lines: string[] = [];
  lines.push(sectionHeader(chalk, 'Bus Factor'));

  const bf = data.busFactor;
  const factorColor = bf.overall.busFactor <= 1 ? chalk.red : bf.overall.busFactor <= 2 ? chalk.yellow : chalk.green;
  lines.push(`  Overall: ${factorColor(String(bf.overall.busFactor))}`);

  if (bf.perDirectory.size > 0) {
    lines.push('');
    const colWidths = [20, 10];
    lines.push(horizontalRule(BOX.topLeft, BOX.teeDown, BOX.topRight, colWidths));
    lines.push(tableRow([chalk.bold('Directory'), chalk.bold('Bus Factor')], colWidths));
    lines.push(horizontalRule(BOX.teeRight, BOX.cross, BOX.teeLeft, colWidths));

    for (const [dir, result] of bf.perDirectory) {
      lines.push(tableRow([dir, String(result.busFactor)], colWidths));
    }

    lines.push(horizontalRule(BOX.bottomLeft, BOX.teeUp, BOX.bottomRight, colWidths));
  }

  if (bf.singlePointRisks.length > 0) {
    lines.push('');
    lines.push(`  ${chalk.yellow('⚠')} Single-point-of-knowledge risks: ${chalk.bold(String(bf.singlePointRisks.length))} files`);
    for (const risk of bf.singlePointRisks.slice(0, 5)) {
      lines.push(`    ${chalk.yellow('•')} ${risk.filePath} — ${risk.authorPercentage}% by ${risk.soleAuthor} over ${risk.spanMonths}mo`);
    }
    if (bf.singlePointRisks.length > 5) {
      lines.push(`    ... and ${bf.singlePointRisks.length - 5} more`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Render the PR Velocity section with sparkline.
 */
function renderPRVelocity(chalk: ChalkInstance, data: ReportData): string {
  const lines: string[] = [];
  lines.push(sectionHeader(chalk, 'PR Velocity'));

  const pr = data.prVelocity;
  if (!pr.available) {
    lines.push(`  ${chalk.yellow(pr.warningMessage ?? 'PR velocity data unavailable.')}`);
    lines.push('');
    return lines.join('\n');
  }

  if (pr.averageMergeTime !== null) {
    lines.push(`  Avg merge time: ${chalk.bold(formatDuration(pr.averageMergeTime))}`);
  }

  lines.push(`  Total merges: ${chalk.bold(String(pr.totalMerges))}`);

  if (pr.mergesPerMonth.length > 0) {
    const counts = pr.mergesPerMonth.map((m) => m.count);
    const spark = sparkline(counts);
    lines.push(`  Merges/month: ${spark}`);
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Render a full terminal report from ReportData.
 *
 * @param reportData - The aggregated report data
 * @param noColor - When true, omit all ANSI color codes
 * @returns The formatted report string
 */
export function renderTerminalReport(reportData: ReportData, noColor: boolean): string {
  const chalk = new Chalk({ level: noColor ? 0 : 3 });

  const lines: string[] = [];

  // Title
  lines.push('');
  lines.push(chalk.bold.white(`  git-xray report: ${reportData.repoName}`));
  lines.push(chalk.dim(`  Branch: ${reportData.analyzedBranch}`));
  lines.push(chalk.dim(`  Period: ${reportData.dateRange.from.toISOString().slice(0, 10)} → ${reportData.dateRange.to.toISOString().slice(0, 10)}`));

  // Sections
  lines.push(renderContributors(chalk, reportData));
  lines.push(renderHotspots(chalk, reportData));
  lines.push(renderComplexityTrend(chalk, reportData));
  lines.push(renderBusFactor(chalk, reportData));
  lines.push(renderPRVelocity(chalk, reportData));

  // Footer
  lines.push(chalk.dim(`  Generated at ${reportData.generatedAt.toISOString()}`));
  lines.push('');

  return lines.join('\n');
}
