// Report data aggregator
// Merges all analyzer outputs into a single ReportData object
// and provides truncation functions for HTML and Terminal contexts.

import type { ContributionData } from '../analyzers/contributions.js';
import type { HotspotData } from '../analyzers/hotspots.js';
import type { ComplexityTrendData } from '../analyzers/complexity.js';
import type { BusFactorData } from '../analyzers/bus-factor.js';
import type { PRVelocityData } from '../analyzers/pr-velocity.js';
import type { PersonalStats } from '../analyzers/personal.js';

export interface ReportData {
  repoName: string;
  analyzedBranch: string;
  dateRange: { from: Date; to: Date };
  contributions: ContributionData;
  hotspots: HotspotData;
  complexity: ComplexityTrendData;
  busFactor: BusFactorData;
  prVelocity: PRVelocityData;
  personal?: PersonalStats;
  generatedAt: Date;
}

export interface AggregateInput {
  repoName: string;
  branch: string;
  dateRange: { from: Date; to: Date };
  contributions: ContributionData;
  hotspots: HotspotData;
  complexity: ComplexityTrendData;
  busFactor: BusFactorData;
  prVelocity: PRVelocityData;
  personal?: PersonalStats;
}

/** Truncation limits per output context */
const HTML_HOTSPOT_LIMIT = 100;
const HTML_CONTRIBUTOR_LIMIT = 50;
const TERMINAL_HOTSPOT_LIMIT = 20;
const TERMINAL_CONTRIBUTOR_LIMIT = 10;

/**
 * Merge all analyzer outputs into a single ReportData object.
 * No truncation is applied — this produces the full dataset (suitable for JSON output).
 */
export function aggregateReport(input: AggregateInput): ReportData {
  return {
    repoName: input.repoName,
    analyzedBranch: input.branch,
    dateRange: { from: input.dateRange.from, to: input.dateRange.to },
    contributions: input.contributions,
    hotspots: input.hotspots,
    complexity: input.complexity,
    busFactor: input.busFactor,
    prVelocity: input.prVelocity,
    personal: input.personal,
    generatedAt: new Date(),
  };
}

/**
 * Return a truncated copy of ReportData for HTML output.
 * Limits: 100 hotspots, 50 contributors.
 * The original ReportData is not modified.
 */
export function truncateForHtml(report: ReportData): ReportData {
  return truncateReport(report, HTML_HOTSPOT_LIMIT, HTML_CONTRIBUTOR_LIMIT);
}

/**
 * Return a truncated copy of ReportData for Terminal output.
 * Limits: 20 hotspots, 10 contributors.
 * The original ReportData is not modified.
 */
export function truncateForTerminal(report: ReportData): ReportData {
  return truncateReport(report, TERMINAL_HOTSPOT_LIMIT, TERMINAL_CONTRIBUTOR_LIMIT);
}

/**
 * Internal helper: create a shallow copy of ReportData with truncated
 * hotspots and contributors arrays.
 */
function truncateReport(
  report: ReportData,
  hotspotLimit: number,
  contributorLimit: number,
): ReportData {
  return {
    ...report,
    hotspots: {
      ...report.hotspots,
      hotspots: report.hotspots.hotspots.slice(0, hotspotLimit),
    },
    contributions: {
      ...report.contributions,
      authors: report.contributions.authors.slice(0, contributorLimit),
    },
  };
}
