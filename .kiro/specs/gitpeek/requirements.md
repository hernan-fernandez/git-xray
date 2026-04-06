# Requirements Document

## Introduction

gitpeek is a CLI tool that generates beautiful, shareable visual reports of git repository statistics. Runnable via `npx gitpeek`, it analyzes any git repo to produce a "GitHub Wrapped" style report covering contribution patterns, code hotspots, complexity trends, bus factor, and PR velocity. The target audience is developers who enjoy discovering and sharing insights about their projects.

## Glossary

- **CLI**: The command-line interface through which users invoke gitpeek
- **Report**: The generated visual output containing all computed statistics and charts
- **Contribution_Pattern**: A statistical summary of commit frequency, authorship distribution, and activity over time
- **Code_Hotspot**: A file or module that has been modified disproportionately often relative to the rest of the codebase
- **Complexity_Trend**: A time-series measurement of code complexity (e.g., cyclomatic complexity or churn rate) across the repository history
- **Bus_Factor**: The minimum number of contributors whose departure would leave a file or module without knowledgeable maintainers
- **PR_Velocity**: A measure of pull request throughput including open-to-merge time, review turnaround, and merge frequency (derived from git branch/merge history when remote metadata is unavailable)
- **Git_Repository**: A local directory containing a valid `.git` folder
- **HTML_Report**: A self-contained HTML file that renders the visual report in a browser
- **Terminal_Report**: A summary of key statistics rendered directly in the terminal using formatted text and inline charts

## Requirements

### Requirement 1: CLI Invocation and Repository Detection

**User Story:** As a developer, I want to run `npx gitpeek` in any git repository so that I can instantly generate a stats report without configuration.

#### Acceptance Criteria

1. WHEN the user runs `npx gitpeek` inside a Git_Repository, THE CLI SHALL detect the repository root and begin analysis
2. WHEN the user runs `npx gitpeek <path>`, THE CLI SHALL use the provided path as the target Git_Repository
3. IF the target directory is not a valid Git_Repository, THEN THE CLI SHALL exit with a descriptive error message and a non-zero exit code
4. IF no git binary is found on the system PATH, THEN THE CLI SHALL exit with an error message instructing the user to install git

### Requirement 2: Contribution Pattern Analysis

**User Story:** As a developer, I want to see who contributed what and when, so that I can understand the collaboration dynamics of my project.

#### Acceptance Criteria

1. WHEN analysis begins, THE CLI SHALL compute per-author commit counts, lines added, and lines removed across the full repository history
2. WHEN analysis begins, THE CLI SHALL compute a commit frequency heatmap grouped by day-of-week and hour-of-day
3. WHEN analysis begins, THE CLI SHALL identify the top 10 contributors ranked by commit count
4. WHEN the repository contains fewer than 10 contributors, THE CLI SHALL list all contributors without padding

### Requirement 3: Code Hotspot Detection

**User Story:** As a developer, I want to identify which files change most frequently, so that I can focus refactoring and review efforts on high-churn areas.

#### Acceptance Criteria

1. WHEN analysis begins, THE CLI SHALL compute a change frequency for each file based on the number of commits that modified the file using simple path-based tracking
2. WHEN analysis begins, THE CLI SHALL rank files by change frequency and identify the top 20 Code_Hotspots
3. WHEN the `--follow-renames` flag is provided, THE CLI SHALL track files across renames using git log follow behavior
4. WHEN the `--follow-renames` flag is not provided, THE CLI SHALL use path-based tracking only, without computing rename similarity
5. IF the `--follow-renames` flag is provided and the repository contains more than 5,000 commits, THEN THE CLI SHALL display a warning that rename tracking may be slow on large repositories

### Requirement 4: Complexity Trend Analysis

**User Story:** As a developer, I want to see how code complexity has evolved over time, so that I can spot periods of increasing technical debt.

#### Acceptance Criteria

1. WHEN analysis begins, THE CLI SHALL compute a Complexity_Trend by sampling repository snapshots at regular intervals (e.g., monthly)
2. THE CLI SHALL measure complexity using file size and churn rate as proxy metrics
3. WHEN the repository has fewer than 3 months of history, THE CLI SHALL use weekly intervals instead of monthly intervals
4. THE Report SHALL present the Complexity_Trend as a time-series chart
5. THE CLI SHALL analyze git tree objects directly using `git ls-tree` and `git cat-file` to read snapshot data without physically checking out files
6. THE CLI SHALL NOT modify the working tree, index, or HEAD reference during analysis

### Requirement 5: Bus Factor Calculation

**User Story:** As a developer, I want to know the bus factor of my project, so that I can identify knowledge concentration risks.

#### Acceptance Criteria

1. WHEN analysis begins, THE CLI SHALL compute the Bus_Factor for the overall repository
2. WHEN analysis begins, THE CLI SHALL compute a per-directory Bus_Factor for each top-level directory
3. THE CLI SHALL calculate Bus_Factor by determining the minimum set of authors who collectively account for at least 50% of weighted commits to a given scope
4. THE CLI SHALL apply a time-decay weighting where commits from the last 12 months receive full weight, and older commits receive linearly decreasing weight down to a minimum of 0.1 for commits older than 36 months
5. IF a file has only one author within the last 12 months, THEN THE CLI SHALL flag the file as a single-point-of-knowledge risk in the Report

### Requirement 6: PR Velocity Metrics

**User Story:** As a developer, I want to understand the pace of code integration, so that I can evaluate team throughput and review bottlenecks.

#### Acceptance Criteria

1. WHEN analysis begins, THE CLI SHALL derive PR_Velocity metrics from merge commit patterns in the git history
2. THE CLI SHALL compute the average time between a branch creation and its merge commit
3. THE CLI SHALL compute the total number of merges per month over the repository lifetime
4. IF the repository contains no merge commits, THEN THE CLI SHALL omit the PR_Velocity section from the Report
5. IF the repository history is linear (no merge commits detected), THEN THE CLI SHALL display a warning in both the HTML_Report and the Terminal_Report stating that PR velocity cannot be calculated due to a likely rebase or squash merge workflow

### Requirement 7: HTML Report Generation

**User Story:** As a developer, I want a beautiful, self-contained HTML report, so that I can open it in a browser and share it with teammates.

#### Acceptance Criteria

1. WHEN analysis completes, THE CLI SHALL generate an HTML_Report as a single self-contained HTML file with all CSS and JavaScript inlined
2. THE HTML_Report SHALL include interactive charts for Contribution_Patterns, Code_Hotspots, Complexity_Trends, Bus_Factor, and PR_Velocity
3. THE HTML_Report SHALL render correctly in the latest stable versions of Chrome, Firefox, and Safari
4. WHEN the `--output <path>` flag is provided, THE CLI SHALL write the HTML_Report to the specified path
5. WHEN no `--output` flag is provided, THE CLI SHALL write the HTML_Report to `./gitpeek-report.html` in the current working directory
6. WHEN report generation completes, THE CLI SHALL automatically open the HTML_Report in the default browser unless the `--no-open` flag is provided
7. THE CLI SHALL aggregate data injected into the HTML_Report to a maximum of the top 100 Code_Hotspots and top 50 contributors to keep the HTML file size manageable
8. WHEN the `--json` flag is provided, THE CLI SHALL include the full untruncated dataset in the JSON output

### Requirement 8: Terminal Report Output

**User Story:** As a developer, I want a quick summary printed in my terminal, so that I can glance at key stats without opening a browser.

#### Acceptance Criteria

1. WHEN analysis completes, THE CLI SHALL print a Terminal_Report to stdout containing a summary of each analysis section
2. THE Terminal_Report SHALL use colored text and Unicode box-drawing characters to format the output
3. WHEN the `--no-color` flag is provided, THE CLI SHALL omit ANSI color codes from the Terminal_Report
4. THE Terminal_Report SHALL include sparkline-style inline charts for commit frequency and complexity trends

### Requirement 9: Performance and Progress Feedback

**User Story:** As a developer, I want the tool to run quickly and show progress, so that I don't wonder if it's stuck on large repos.

#### Acceptance Criteria

1. WHILE analysis is in progress, THE CLI SHALL display a progress indicator showing the current analysis phase
2. THE CLI SHALL complete analysis of a repository with up to 10,000 commits within 30 seconds on a machine with a standard SSD
3. IF analysis of a single phase takes longer than 10 seconds, THEN THE CLI SHALL display an estimated time remaining for that phase

### Requirement 10: Configuration and Flags

**User Story:** As a developer, I want to customize the report scope, so that I can focus on specific time ranges or branches.

#### Acceptance Criteria

1. WHEN the `--since <date>` flag is provided, THE CLI SHALL limit analysis to commits after the specified date
2. WHEN the `--until <date>` flag is provided, THE CLI SHALL limit analysis to commits before the specified date
3. WHEN the `--branch <name>` flag is provided, THE CLI SHALL analyze only the specified branch
4. WHEN no `--branch` flag is provided, THE CLI SHALL analyze the currently checked-out branch
5. WHEN the `--json` flag is provided, THE CLI SHALL output the raw analysis data as a JSON file alongside the HTML_Report
6. IF an unrecognized flag is provided, THEN THE CLI SHALL display a help message listing all supported flags and exit with a non-zero exit code
7. WHEN the `--scope <path>` flag is provided, THE CLI SHALL restrict all analysis (Code_Hotspots, Contribution_Patterns, Bus_Factor, Complexity_Trends, and PR_Velocity) to files within the specified sub-folder
8. IF the `--scope` path does not exist within the Git_Repository, THEN THE CLI SHALL exit with a descriptive error message and a non-zero exit code
