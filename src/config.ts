// git-wrapped configuration and flag parsing

export interface GitPeekConfig {
  repoPath: string;
  branch?: string;
  since?: Date;
  until?: Date;
  scope?: string;
  followRenames: boolean;
  output: string;
  noOpen: boolean;
  noColor: boolean;
  json: boolean;
}

const KNOWN_FLAGS = new Set([
  '--since',
  '--until',
  '--branch',
  '--scope',
  '--output',
  '--no-open',
  '--no-color',
  '--json',
  '--follow-renames',
]);

const HELP_TEXT = `Usage: git-wrapped [options] [path]

Analyze a git repository and generate a visual stats report.

Options:
  --since <date>       Limit analysis to commits after this date
  --until <date>       Limit analysis to commits before this date
  --branch <name>      Analyze a specific branch (default: current branch)
  --scope <path>       Restrict analysis to a sub-folder
  --output <path>      Output path for the HTML report (default: ./<repo-name>-<date>.html)
  --no-open            Don't auto-open the report in a browser
  --no-color           Disable colored terminal output
  --json               Output raw analysis data as JSON alongside the HTML report
  --follow-renames     Track files across renames (may be slow on large repos)
`;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

export function parseConfig(argv: string[]): GitPeekConfig {
  // Skip the first two args (node binary and script path)
  const args = argv.slice(2);

  const config: GitPeekConfig = {
    repoPath: process.cwd(),
    followRenames: false,
    output: '',
    noOpen: false,
    noColor: false,
    json: false,
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    // Handle --flag=value form
    const eqIndex = arg.indexOf('=');
    let flag: string;
    let inlineValue: string | undefined;
    if (eqIndex !== -1) {
      flag = arg.slice(0, eqIndex);
      inlineValue = arg.slice(eqIndex + 1);
    } else {
      flag = arg;
      inlineValue = undefined;
    }

    if (flag.startsWith('--')) {
      if (!KNOWN_FLAGS.has(flag)) {
        throw new ConfigError(`Unknown flag: ${flag}\n\n${HELP_TEXT}`);
      }

      switch (flag) {
        case '--since': {
          const value = inlineValue ?? args[++i];
          if (!value) throw new ConfigError('--since requires a date value');
          const date = new Date(value);
          if (isNaN(date.getTime())) throw new ConfigError(`Invalid date for --since: ${value}`);
          config.since = date;
          break;
        }
        case '--until': {
          const value = inlineValue ?? args[++i];
          if (!value) throw new ConfigError('--until requires a date value');
          const date = new Date(value);
          if (isNaN(date.getTime())) throw new ConfigError(`Invalid date for --until: ${value}`);
          config.until = date;
          break;
        }
        case '--branch': {
          const value = inlineValue ?? args[++i];
          if (!value) throw new ConfigError('--branch requires a branch name');
          config.branch = value;
          break;
        }
        case '--scope': {
          const value = inlineValue ?? args[++i];
          if (!value) throw new ConfigError('--scope requires a path');
          config.scope = value;
          break;
        }
        case '--output': {
          const value = inlineValue ?? args[++i];
          if (!value) throw new ConfigError('--output requires a file path');
          config.output = value;
          break;
        }
        case '--no-open':
          config.noOpen = true;
          break;
        case '--no-color':
          config.noColor = true;
          break;
        case '--json':
          config.json = true;
          break;
        case '--follow-renames':
          config.followRenames = true;
          break;
      }
    } else {
      // Positional argument — first one is the repo path
      config.repoPath = arg;
    }

    i++;
  }

  return config;
}
