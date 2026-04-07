#!/usr/bin/env node

// git-xray CLI entry point

import { parseConfig, ConfigError } from './config.js';
import { validate } from './validator.js';
import { runAnalysis } from './orchestrator.js';
import { cloneIfUrl, cleanupClone, repoNameFromUrl } from './remote.js';

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

  // If repoPath is a URL, clone it to a temp directory
  const cloneInfo = await cloneIfUrl(config.repoPath);
  if (cloneInfo) {
    config.repoPath = cloneInfo.path;
    config.repoDisplayName = repoNameFromUrl(cloneInfo.url);
  }

  try {
    // Validate repo and git binary
    const result = await validate(config.repoPath);
    if (!result.valid) {
      process.stderr.write(result.error + '\n');
      process.exit(1);
    }

    // Run the full analysis pipeline
    await runAnalysis(config);
  } finally {
    // Clean up temp clone if we created one
    if (cloneInfo) {
      await cleanupClone(cloneInfo.path);
    }
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Fatal error: ${message}\n`);
  process.exit(1);
});
