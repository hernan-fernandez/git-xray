import type { ReportData } from './aggregator.js';
/**
 * Render a self-contained HTML report.
 *
 * - Reads the HTML template from disk
 * - Inlines the ECharts library JS (from node_modules)
 * - Injects the serialized ReportData as window.__GITPEEK_DATA__
 * - Minifies the final output
 * - Returns a string with zero external resource references
 */
export declare function renderHtmlReport(reportData: ReportData): Promise<string>;
//# sourceMappingURL=html-renderer.d.ts.map