// Generates self-contained HTML report
// Reads the template, inlines ECharts JS and CSS, injects serialized ReportData.
// The final output has zero external resource references.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import type { ReportData } from './aggregator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);

const ECHARTS_PLACEHOLDER = '<!-- ECHARTS_JS -->';
const DATA_PLACEHOLDER = '<!-- REPORT_DATA -->';

/**
 * Serialize ReportData for embedding in HTML.
 * Handles Map instances (e.g. perDirectory) by converting them to plain objects.
 */
function serializeReportData(data: ReportData): string {
  const json = JSON.stringify(data, (_key, value) => {
    if (value instanceof Map) {
      return Object.fromEntries(value);
    }
    return value;
  });
  // Escape sequences that could break out of the inline <script> context.
  // "<" prevents "</script>" termination and "<!--" tricks from data values
  // (author names, file paths, and branch names are attacker-controlled).
  // U+2028/U+2029 are valid in JSON but illegal in JS source text.
  return json
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
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
 * - Injects the serialized ReportData as window.__GIT_XRAY_DATA__
 * - Minifies the final output
 * - Returns a string with zero external resource references
 */
export async function renderHtmlReport(reportData: ReportData): Promise<string> {
  // Read the HTML template
  const templatePath = join(__dirname, 'template', 'report.html');
  const template = await readFile(templatePath, 'utf-8');

  // Read the ECharts minified JS, resolved through Node module resolution so
  // it works under any package-manager layout (hoisted, nested, or pnpm).
  const echartsPath = require.resolve('echarts/dist/echarts.min.js');
  const echartsJs = await readFile(echartsPath, 'utf-8');

  // Build the inlined ECharts script tag
  const echartsScript = `<script>${echartsJs}</script>`;

  // Build the data injection script
  const dataScript = `window.__GIT_XRAY_DATA__ = ${serializeReportData(reportData)};`;

  // Replace placeholders. Function form so "$"-patterns ($$, $&, $`) in the
  // replacement content are inserted literally instead of being interpreted
  // by String.replace (echarts.min.js contains "$$"; data strings may too).
  let html = template.replace(ECHARTS_PLACEHOLDER, () => echartsScript);
  html = html.replace(DATA_PLACEHOLDER, () => dataScript);

  // Minify the final output
  html = minifyHtml(html);

  return html;
}
