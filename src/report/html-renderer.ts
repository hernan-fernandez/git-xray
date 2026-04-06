// Generates self-contained HTML report
// Reads the template, inlines ECharts JS and CSS, injects serialized ReportData.
// The final output has zero external resource references.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { ReportData } from './aggregator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ECHARTS_PLACEHOLDER = '<!-- ECHARTS_JS -->';
const DATA_PLACEHOLDER = '<!-- REPORT_DATA -->';

/**
 * Serialize ReportData for embedding in HTML.
 * Handles Map instances (e.g. perDirectory) by converting them to plain objects.
 */
function serializeReportData(data: ReportData): string {
  return JSON.stringify(data, (_key, value) => {
    if (value instanceof Map) {
      return Object.fromEntries(value);
    }
    return value;
  });
}

/**
 * Minify HTML by collapsing whitespace between tags and trimming lines.
 * Preserves content inside <script> and <style> blocks.
 */
function minifyHtml(html: string): string {
  // Remove HTML comments (but not our placeholders or conditional comments)
  let result = html.replace(/<!--(?!\[if)[\s\S]*?-->/g, '');
  // Collapse runs of whitespace between tags
  result = result.replace(/>\s+</g, '><');
  // Trim leading/trailing whitespace on each line and collapse blank lines
  result = result
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');
  return result;
}

/**
 * Render a self-contained HTML report.
 *
 * - Reads the HTML template from disk
 * - Inlines the ECharts library JS (from node_modules)
 * - Injects the serialized ReportData as window.__GITPEEK_DATA__
 * - Minifies the final output
 * - Returns a string with zero external resource references
 */
export async function renderHtmlReport(reportData: ReportData): Promise<string> {
  // Read the HTML template
  const templatePath = join(__dirname, 'template', 'report.html');
  const template = await readFile(templatePath, 'utf-8');

  // Read the ECharts minified JS
  const echartsPath = join(__dirname, '..', '..', 'node_modules', 'echarts', 'dist', 'echarts.min.js');
  const echartsJs = await readFile(echartsPath, 'utf-8');

  // Build the inlined ECharts script tag
  const echartsScript = `<script>${echartsJs}</script>`;

  // Build the data injection script
  const dataScript = `window.__GITPEEK_DATA__ = ${serializeReportData(reportData)};`;

  // Replace placeholders
  let html = template.replace(ECHARTS_PLACEHOLDER, echartsScript);
  html = html.replace(DATA_PLACEHOLDER, dataScript);

  // Minify the final output
  html = minifyHtml(html);

  return html;
}
