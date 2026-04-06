// Writes full untruncated ReportData as formatted JSON to disk.
// Handles Map instances (e.g. busFactor.perDirectory) by converting
// them to plain objects during serialization.
import { writeFile } from 'node:fs/promises';
/**
 * Custom JSON replacer that converts Map instances to plain objects.
 */
function mapReplacer(_key, value) {
    if (value instanceof Map) {
        const obj = {};
        for (const [k, v] of value) {
            obj[String(k)] = v;
        }
        return obj;
    }
    return value;
}
/**
 * Write the full untruncated ReportData as formatted JSON (2-space indent) to disk.
 *
 * @param reportData - The complete, untruncated report data
 * @param outputPath - Absolute or relative path for the JSON file
 */
export async function writeJsonReport(reportData, outputPath) {
    const json = JSON.stringify(reportData, mapReplacer, 2);
    await writeFile(outputPath, json, 'utf-8');
}
//# sourceMappingURL=json-writer.js.map