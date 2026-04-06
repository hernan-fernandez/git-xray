// Report data aggregator
// Merges all analyzer outputs into a single ReportData object
// and provides truncation functions for HTML and Terminal contexts.
/** Truncation limits per output context */
const HTML_HOTSPOT_LIMIT = 100;
const HTML_CONTRIBUTOR_LIMIT = 50;
const TERMINAL_HOTSPOT_LIMIT = 20;
const TERMINAL_CONTRIBUTOR_LIMIT = 10;
/**
 * Merge all analyzer outputs into a single ReportData object.
 * No truncation is applied — this produces the full dataset (suitable for JSON output).
 */
export function aggregateReport(input) {
    return {
        repoName: input.repoName,
        analyzedBranch: input.branch,
        dateRange: { from: input.dateRange.from, to: input.dateRange.to },
        contributions: input.contributions,
        hotspots: input.hotspots,
        complexity: input.complexity,
        busFactor: input.busFactor,
        prVelocity: input.prVelocity,
        generatedAt: new Date(),
    };
}
/**
 * Return a truncated copy of ReportData for HTML output.
 * Limits: 100 hotspots, 50 contributors.
 * The original ReportData is not modified.
 */
export function truncateForHtml(report) {
    return truncateReport(report, HTML_HOTSPOT_LIMIT, HTML_CONTRIBUTOR_LIMIT);
}
/**
 * Return a truncated copy of ReportData for Terminal output.
 * Limits: 20 hotspots, 10 contributors.
 * The original ReportData is not modified.
 */
export function truncateForTerminal(report) {
    return truncateReport(report, TERMINAL_HOTSPOT_LIMIT, TERMINAL_CONTRIBUTOR_LIMIT);
}
/**
 * Internal helper: create a shallow copy of ReportData with truncated
 * hotspots and contributors arrays.
 */
function truncateReport(report, hotspotLimit, contributorLimit) {
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
//# sourceMappingURL=aggregator.js.map