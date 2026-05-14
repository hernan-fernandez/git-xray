// git-xray configuration and flag parsing

export interface GitXrayConfig {
  repoPath: string;
  repoDisplayName?: string;  // Set when cloning from URL
  branch?: string;
  since?: Date;
  until?: Date;
  scope?: string;
  author?: string;           // Personal mode: filter to one author
  followRenames: boolean;
  output: string;
  noOpen: boolean;
  noColor: boolean;
  json: boolean;
  quiet: boolean;            // Suppress terminal report (HTML/JSON still written)
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
  '--author',
  '--me',
  '--quiet',
  '--help',
]);

/** Short-flag aliases. Mapped to their long form before lookup. */
const SHORT_FLAG_ALIASES: Record<string, string> = {
  '-h': '--help',
  '-q': '--quiet',
};

export const HELP_TEXT = `Usage: git-xray [options] [path]

Analyze a git repository and generate a visual stats report.

Options:
  -h, --help           Show this help message and exit
  --since <date>       Limit analysis to commits after this date
  --until <date>       Limit analysis to commits before this date
  --branch <name>      Analyze a specific branch (default: current branch)
  --scope <path>       Restrict analysis to a sub-folder
  --output <path>      Output path for the HTML report (default: ./<repo-name>-<date>.html)
  --no-open            Don't auto-open the report in a browser
  --no-color           Disable colored terminal output
  -q, --quiet          Suppress the terminal summary (HTML and JSON are still written)
  --json               Output raw analysis data as JSON alongside the HTML report
  --follow-renames     Track files across renames (may be slow on large repos)
  --author <name>      Personal mode: show stats for a specific author
  --me                 Personal mode: use your git config user.name
`;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Thrown by parseConfig when the user requests --help/-h. The CLI catches it,
 * prints HELP_TEXT to stdout, and exits 0.
 */
export class HelpRequested extends Error {
  constructor() {
    super('help requested');
    this.name = 'HelpRequested';
  }
}

export function parseConfig(argv: string[]): GitXrayConfig {
  // Skip the first two args (node binary and script path)
  const args = argv.slice(2);

  const config: GitXrayConfig = {
    repoPath: process.cwd(),
    followRenames: false,
    output: '',
    noOpen: false,
    noColor: false,
    json: false,
    quiet: false,
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

    // Resolve short-flag aliases (e.g. -h → --help) before any further checks
    if (SHORT_FLAG_ALIASES[flag]) {
      flag = SHORT_FLAG_ALIASES[flag];
    }

    if (flag.startsWith('--')) {
      if (!KNOWN_FLAGS.has(flag)) {
        throw new ConfigError(`Unknown flag: ${flag}\n\n${HELP_TEXT}`);
      }

      switch (flag) {
        case '--help':
          throw new HelpRequested();
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
        case '--quiet':
          config.quiet = true;
          break;
        case '--follow-renames':
          config.followRenames = true;
          break;
        case '--author': {
          const value = inlineValue ?? args[++i];
          if (!value) throw new ConfigError('--author requires a name');
          config.author = value;
          break;
        }
        case '--me':
          config.author = '__ME__'; // Resolved later from git config
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
