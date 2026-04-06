#!/usr/bin/env node

// gitpeek CLI entry point

import { parseConfig, ConfigError } from './config.js';
import { validate } from './validator.js';
import { runAnalysis } from './orchestrator.js';

async function main(): Promise<void> {
  // Parse CLI flags
  let config;
  try {
    config = parseConfig(process.argv);
  } catch (err) {
    if (err instanceof ConfigError) {
      process.stderr.write(err.message + '\n');
      process.exit(1);
    }
    throw err;
  }

  // Validate repo and git binary
  const result = await validate(config.repoPath);
  if (!result.valid) {
    process.stderr.write(result.error + '\n');
    process.exit(1);
  }

  // Run the full analysis pipeline
  await runAnalysis(config);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Fatal error: ${message}\n`);
  process.exit(1);
});
