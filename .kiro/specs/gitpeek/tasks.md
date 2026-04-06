# Implementation Tasks: gitpeek

## Task 1: Project Scaffolding and Configuration

- [x] 1.1 Initialize Node.js project with `package.json` (name: `gitpeek`, bin: `gitpeek`), TypeScript config (`tsconfig.json`), and Vitest config (`vitest.config.ts`)
- [x] 1.2 Install core dependencies: `ink`, `react`, `echarts`, `p-limit`, and dev dependencies: `typescript`, `vitest`, `fast-check`, `@types/node`, `@types/react`
- [x] 1.3 Create the `src/` directory structure matching the design module layout (`cli.ts`, `config.ts`, `validator.ts`, `orchestrator.ts`, `git/`, `parsers/`, `analyzers/`, `report/`, `utils/`)
- [x] 1.4 Create the `tests/` directory structure (`tests/unit/`, `tests/properties/`)

## Task 2: Config and CLI Entry Point

- [x] 2.1 Implement `src/config.ts` — parse CLI flags (`--since`, `--until`, `--branch`, `--scope`, `--output`, `--no-open`, `--no-color`, `--json`, `--follow-renames`) into a `GitPeekConfig` object; reject unrecognized flags with help text and non-zero exit
- [x] 2.2 Implement `src/validator.ts` — validate that the target path contains a `.git` directory and that the `git` binary is on PATH; return descriptive errors for each failure case
- [x] 2.3 Implement `src/cli.ts` — entry point that calls config parser and validator, then hands off to orchestrator; handle top-level errors with appropriate exit codes

## Task 3: Git Command Runner

- [x] 3.1 Implement `src/git/runner.ts` — `stream(args)` spawns `child_process.spawn` and returns a `Readable`; `exec(args)` collects full stdout as string; handle exit codes and stderr; send SIGTERM on error cleanup
- [x] 3.2 Implement `src/git/commands.ts` — builder functions for each git command in the Git Command Mapping table; use `%aN`/`%aE` (mailmap-resolved) format specifiers in all `git log` format strings; apply `--since`/`--until`/`--branch`/`--scope` filters

## Task 4: Parsers

- [x] 4.1 Implement `src/parsers/log-parser.ts` — Transform stream that parses pipe-delimited `git log` output into `CommitRecord` objects; handle partial line buffering
- [x] 4.2 Implement `src/parsers/numstat-parser.ts` — Transform stream that parses `--numstat` output into `FileChangeRecord` objects; handle binary file markers (`-\t-`)
- [x] 4.3 Implement `src/parsers/ls-tree-parser.ts` — Transform stream that parses `git ls-tree -r -l` output into `TreeEntry` objects
- [x] 4.4 Implement `src/parsers/merge-parser.ts` — Transform stream that parses merge commit log output into merge records with parent hashes
- [x] 4.5 Implement `src/parsers/shortlog-parser.ts` — Transform stream that parses `git shortlog` output into author summaries

## Task 5: Contribution Analyzer

- [x] 5.1 Implement `src/analyzers/contributions.ts` — consume commit records and file change records; compute per-author commit counts, lines added/removed; build day-of-week × hour-of-day heatmap; rank top-N contributors by commit count
- [x] 5.2 Write unit tests for contribution analyzer (`tests/unit/analyzers/contributions.test.ts`) — known input → expected output, single-author edge case, empty input

## Task 6: Hotspot Analyzer

- [x] 6.1 Implement `src/analyzers/hotspots.ts` — two-phase approach: (1) consume `git log --name-status` output to compute change frequencies for all files in a single pass, (2) when `--follow-renames` is enabled, run `git log --follow` only for the final top-20 files in parallel using `p-limit` with concurrency of 5; rank files by change count
- [x] 6.2 Write unit tests for hotspot analyzer (`tests/unit/analyzers/hotspots.test.ts`) — known file change sets, rename tracking scenario, large-repo warning for `--follow-renames` with >5000 commits

## Task 7: Complexity Trend Analyzer

- [x] 7.1 Implement `src/analyzers/complexity.ts` — determine snapshot interval (monthly if ≥3 months history, weekly otherwise); for each snapshot, use `git rev-list` to find the commit at that date, then `git ls-tree -r -l` to compute totalFiles, totalSize, and churnRate
- [x] 7.2 Write unit tests for complexity analyzer (`tests/unit/analyzers/complexity.test.ts`) — monthly vs weekly interval selection, snapshot metric computation

## Task 8: Bus Factor Analyzer

- [x] 8.1 Implement `src/utils/time-decay.ts` — time-decay weighting function: 1.0 if age ≤ 12 months, 0.1 if age > 36 months, linearly interpolated in between; age must be calculated relative to the `--until` date when provided, otherwise relative to the current system time
- [x] 8.2 Implement `src/analyzers/bus-factor.ts` — compute overall and per-directory bus factor using weighted commit counts (author identity resolved via `.mailmap` through `%aN`/`%aE`); identify single-point-of-knowledge risks (files with exactly 1 author in last 12 months); pass the reference date (from `--until` or current time) to the time-decay function
- [x] 8.3 Write unit tests for bus factor analyzer and time-decay (`tests/unit/analyzers/bus-factor.test.ts`, `tests/unit/utils/time-decay.test.ts`) — threshold boundary cases, single-author files, time-decay edge values, verify age is relative to `--until` date when provided

## Task 9: PR Velocity Analyzer

- [x] 9.1 Implement `src/analyzers/pr-velocity.ts` — build main-line commit set from a single `git log --first-parent` pass; for each merge commit's second parent, walk back to find divergence from main-line (approximates branch creation time without per-merge `merge-base` calls); handle nested merges where the second parent itself has multiple parents by recursively walking until a single-parent commit or main-line commit is found; compute average merge time and merges-per-month; set `available=false` with warning when no merge commits found
- [x] 9.2 Write unit tests for PR velocity analyzer (`tests/unit/analyzers/pr-velocity.test.ts`) — known merge history, linear history (no merges), single merge edge case, nested merge scenario (second parent has multiple parents)

## Task 10: Report Aggregator

- [x] 10.1 Implement `src/report/aggregator.ts` — merge all analyzer outputs into a single `ReportData` object; apply truncation limits (HTML: 100 hotspots / 50 contributors, Terminal: 20 / 10, JSON: unlimited)
- [x] 10.2 Write unit tests for aggregator (`tests/unit/report/aggregator.test.ts`) — truncation boundary cases, full data passthrough for JSON

## Task 11: HTML Report Renderer

- [x] 11.1 Create `src/report/template/report.html` — HTML template with ECharts placeholders for all 6 chart types (contributor bar chart, heatmap, hotspot horizontal bar, complexity line chart, bus factor gauge + table, PR velocity line chart); minify the template HTML before injection to keep the final output lean
- [x] 11.2 Implement `src/report/html-renderer.ts` — read template, inline minified ECharts JS and all CSS, inject serialized `ReportData` as a `<script>` block; ensure zero external resource references; minify the final HTML output
- [x] 11.3 Write unit tests for HTML renderer (`tests/unit/report/html-renderer.test.ts`) — verify self-containment (no external links/scripts), data injection correctness

## Task 12: Terminal Report Renderer

- [x] 12.1 Implement `src/utils/sparkline.ts` — generate Unicode sparkline strings (▁▂▃▄▅▆▇█) from numeric arrays
- [x] 12.2 Implement `src/report/terminal-renderer.ts` — use `ink` to render formatted summary with tables (Unicode box-drawing), sparklines, and colored text; respect `--no-color` flag
- [x] 12.3 Write unit tests for terminal renderer and sparkline (`tests/unit/report/terminal-renderer.test.ts`, `tests/unit/utils/sparkline.test.ts`) — no-color output has zero ANSI escapes, sparkline mapping correctness

## Task 13: JSON Writer

- [x] 13.1 Implement `src/report/json-writer.ts` — write full untruncated `ReportData` as formatted JSON to disk
- [x] 13.2 Implement `src/utils/progress.ts` — progress indicator showing current analysis phase and ETA when a phase exceeds 10 seconds

## Task 14: Orchestrator

- [x] 14.1 Implement `src/orchestrator.ts` — sequence analysis phases (contributions → hotspots → complexity → bus factor → PR velocity); pass config filters to GitRunner; report progress after each phase; handle graceful degradation (skip failed phases, continue with rest)
- [x] 14.2 Write unit tests for orchestrator (`tests/unit/orchestrator.test.ts` — mock GitRunner) — phase sequencing, graceful degradation when a phase fails, progress reporting

## Task 15: Property-Based Tests (Properties 1–5)

- [x] 15.1 Implement `tests/properties/repo-validation.prop.test.ts` — Property 1: for any directory path, validator returns success iff `.git` exists
- [x] 15.2 Implement `tests/properties/contribution-aggregation.prop.test.ts` — Property 2: per-author sums equal global totals
- [x] 15.3 Implement `tests/properties/heatmap-completeness.prop.test.ts` — Property 3: heatmap cell sum equals total commits
- [x] 15.4 Implement `tests/properties/contributor-ranking.prop.test.ts` — Property 4: top-N sorted non-increasing, length = min(N, total)
- [x] 15.5 Implement `tests/properties/change-frequency.prop.test.ts` — Property 5: change frequency equals distinct commit count per file

## Task 16: Property-Based Tests (Properties 6–10)

- [x] 16.1 Implement `tests/properties/hotspot-ranking.prop.test.ts` — Property 6: top-20 sorted non-increasing, length = min(20, total)
- [x] 16.2 Implement `tests/properties/snapshot-interval.prop.test.ts` — Property 7: monthly spacing for ≥3 months, weekly for <3 months
- [x] 16.3 Implement `tests/properties/complexity-metric.prop.test.ts` — Property 8: totalSize = sum of file sizes, totalFiles = blob count
- [x] 16.4 Implement `tests/properties/readonly-safety.prop.test.ts` — Property 9: no mutating git commands issued
- [x] 16.5 Implement `tests/properties/bus-factor-threshold.prop.test.ts` — Property 10: top N authors ≥ 50%, top N-1 < 50%

## Task 17: Property-Based Tests (Properties 11–15)

- [x] 17.1 Implement `tests/properties/time-decay.prop.test.ts` — Property 11: weight in [0.1, 1.0], correct piecewise linear values
- [x] 17.2 Implement `tests/properties/single-point-risk.prop.test.ts` — Property 12: file in risk list iff exactly 1 author in last 12 months
- [x] 17.3 Implement `tests/properties/merge-time.prop.test.ts` — Property 13: average merge time = arithmetic mean of durations
- [x] 17.4 Implement `tests/properties/merges-per-month.prop.test.ts` — Property 14: sum of monthly counts = total merges
- [x] 17.5 Implement `tests/properties/html-self-contained.prop.test.ts` — Property 15: zero external resource references

## Task 18: Property-Based Tests (Properties 16–20)

- [x] 18.1 Implement `tests/properties/truncation-completeness.prop.test.ts` — Property 16: HTML truncated, JSON untruncated
- [x] 18.2 Implement `tests/properties/no-color.prop.test.ts` — Property 17: no ANSI escapes when noColor=true
- [x] 18.3 Implement `tests/properties/date-range-filter.prop.test.ts` — Property 18: all included commits within [since, until]
- [x] 18.4 Implement `tests/properties/scope-filter.prop.test.ts` — Property 19: only scope-prefixed files included
- [x] 18.5 Implement `tests/properties/invalid-scope.prop.test.ts` — Property 20: non-existent scope exits with error

## Task 19: Integration and Polish

- [x] 19.1 Wire up `src/cli.ts` as the `bin` entry point; verify `npx gitpeek` invocation works end-to-end on a sample repository
- [x] 19.2 Add auto-open behavior (open HTML report in default browser unless `--no-open`); implement `--json` flag to write JSON alongside HTML
- [x] 19.3 Add the large-repo warning for `--follow-renames` when repository has >5,000 commits (Requirement 3.5)
- [x] 19.4 Final end-to-end smoke test: run against a real repository, verify HTML report opens, terminal output renders, JSON output is valid
