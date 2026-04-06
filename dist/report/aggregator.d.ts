import type { ContributionData } from '../analyzers/contributions.js';
import type { HotspotData } from '../analyzers/hotspots.js';
import type { ComplexityTrendData } from '../analyzers/complexity.js';
import type { BusFactorData } from '../analyzers/bus-factor.js';
import type { PRVelocityData } from '../analyzers/pr-velocity.js';
export interface ReportData {
    repoName: string;
    analyzedBranch: string;
    dateRange: {
        from: Date;
        to: Date;
    };
    contributions: ContributionData;
    hotspots: HotspotData;
    complexity: ComplexityTrendData;
    busFactor: BusFactorData;
    prVelocity: PRVelocityData;
    generatedAt: Date;
}
export interface AggregateInput {
    repoName: string;
    branch: string;
    dateRange: {
        from: Date;
        to: Date;
    };
    contributions: ContributionData;
    hotspots: HotspotData;
    complexity: ComplexityTrendData;
    busFactor: BusFactorData;
    prVelocity: PRVelocityData;
}
/**
 * Merge all analyzer outputs into a single ReportData object.
 * No truncation is applied — this produces the full dataset (suitable for JSON output).
 */
export declare function aggregateReport(input: AggregateInput): ReportData;
/**
 * Return a truncated copy of ReportData for HTML output.
 * Limits: 100 hotspots, 50 contributors.
 * The original ReportData is not modified.
 */
export declare function truncateForHtml(report: ReportData): ReportData;
/**
 * Return a truncated copy of ReportData for Terminal output.
 * Limits: 20 hotspots, 10 contributors.
 * The original ReportData is not modified.
 */
export declare function truncateForTerminal(report: ReportData): ReportData;
//# sourceMappingURL=aggregator.d.ts.map