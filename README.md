# 🔍 git-xray

A CLI tool that generates beautiful, shareable visual reports of git repository statistics. X-ray your codebase to see what's really going on.

git-xray analyzes your git history and produces a self-contained HTML report with interactive charts, fun awards, shareable stats, and a formatted terminal summary — no configuration required.

![git-xray demo](demo.gif)

## What You Get

- **Summary Card** — key stats at a glance with fun awards (Top Contributor, Code Machine, Cleanup Crew, Hottest File, Busiest Day)
- **Contribution Patterns** — who contributed what and when, with a day/hour heatmap
- **Code Hotspots** — files that change most frequently (optional rename tracking)
- **Complexity Trends** — how code size and churn evolve over time
- **Bus Factor** — knowledge concentration risks per directory
- **Knowledge Silo Detection** — interactive risk list showing files with a single maintainer, grouped by directory, with context on why each is a risk
- **PR Velocity** — merge frequency and average time-to-merge
- **Share on X** — one-click sharing with pre-filled stats

## Quick Start

```bash
# Run against the current repo
npx git-xray

# Run against a specific repo
npx git-xray /path/to/repo
```

That's it. No install needed — `npx` downloads and runs it automatically.

This generates a report file like `aws-cdk-examples-2026-04-06.html` (opens automatically in your browser) and prints a terminal summary. Each run gets a unique filename based on the repo name and date.

## Usage

```
git-xray [options] [path]
```

### Options

| Flag | Description |
|---|---|
| `--since <date>` | Limit analysis to commits after this date |
| `--until <date>` | Limit analysis to commits before this date |
| `--branch <name>` | Analyze a specific branch (default: current branch) |
| `--scope <path>` | Restrict analysis to a sub-folder |
| `--output <path>` | Output path for the HTML report (default: `./<repo-name>-<date>.html`) |
| `--follow-renames` | Track files across renames (may be slow on large repos) |
| `--json` | Output raw analysis data as JSON alongside the HTML report |
| `--no-open` | Don't auto-open the report in a browser |
| `--no-color` | Disable colored terminal output |

### Examples

```bash
# Analyze the last year on the main branch
npx git-xray --since 2025-01-01 --branch main

# Focus on the src/ directory, export JSON too
npx git-xray --scope src/ --json

# Custom output path, no browser auto-open
npx git-xray --output ~/reports/my-project.html --no-open

# Track file renames for more accurate hotspot detection
npx git-xray --follow-renames
```

## Output

### HTML Report

A single self-contained `.html` file with all CSS and JavaScript inlined (no external dependencies). Includes:

- Summary card with key stats and fun awards
- Bar chart — top contributors by commits
- Heatmap — commit activity by day of week and hour
- Horizontal bar chart — code hotspots by change frequency
- Line chart — complexity trend over time
- Gauge + table — bus factor overview and per-directory breakdown
- Interactive knowledge silo risk list — click a directory to see files, click a file to see why it's a risk (who owns it, what percentage, how long)
- Line chart — merges per month (PR velocity)
- Share on X button and Copy Link button
- Export Risks as CSV button

### Terminal Summary

A formatted summary printed to stdout with Unicode tables, sparklines, and colored text. Risk files show context inline (e.g., `src/core.ts — 90% by Alice over 24mo`). Use `--no-color` for plain output.

### JSON Export

With `--json`, a full dataset is written alongside the HTML report (e.g., `aws-cdk-examples-2026-04-06.json`). Includes all analysis data with rich risk context.

### CSV Risk Export

The HTML report includes an "Export CSV" button that downloads a spreadsheet of all knowledge silo risks with columns: File, Sole Author, Author %, Total Changes, Span, Last Touched.

## Smart Filtering

The risk list automatically filters out noise:
- Files with only 1 total change (someone added it once, nobody needed to touch it)
- Boilerplate files (`package.json`, `.gitignore`, `tsconfig.json`, `go.sum`, `requirements.txt`, lock files, config files, images, etc.)

This keeps the risk list focused on files that actually matter.

## Requirements

- **Node.js** 18+
- **git** installed and on your PATH
- The target repository must be cloned locally (git-xray reads the `.git` directory)

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Run tests in watch mode
npm run test:watch
```

The test suite includes 241 tests: unit tests for all modules plus 20 property-based tests using fast-check.

## How It Works

git-xray streams raw git command output through Node.js Transform streams, keeping memory usage low even on large repositories. It runs five analysis phases sequentially — if any phase fails, it's skipped gracefully and the rest continue.

All analysis is read-only. git-xray never modifies your working tree, index, or HEAD.

## License

MIT
