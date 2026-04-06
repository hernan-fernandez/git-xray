import type { ReportData } from './aggregator.js';
/**
 * Write the full untruncated ReportData as formatted JSON (2-space indent) to disk.
 *
 * @param reportData - The complete, untruncated report data
 * @param outputPath - Absolute or relative path for the JSON file
 */
export declare function writeJsonReport(reportData: ReportData, outputPath: string): Promise<void>;
//# sourceMappingURL=json-writer.d.ts.map