#!/usr/bin/env node

// git-xray CLI entry point

import { parseConfig, ConfigError, HelpRequested, HELP_TEXT } from './config.js';
import { validateGitBinary, validateRepo } from './validator.js';
import { runAnalysis } from './orchestrator.js';
import { cloneIfUrl, cleanupClone, repoNameFromUrl } from './remote.js';

/** Temp clone directory to remove on exit (set once a clone is created). */
let cloneToCleanup: string | undefined;
let cleanupDone = false;

/** Remove the temp clone exactly once (idempotent across exit paths). */
async function cleanupOnce(): Promise<void> {
  if (cloneToCleanup && !cleanupDone) {
    cleanupDone = true;
    await cleanupClone(cloneToCleanup);
  }
}

/**
 * Ensure the temp clone is removed when the user interrupts the run
 * (Ctrl+C during a large clone would otherwise orphan it in tmpdir).
 */
function registerSignalHandlers(): void {
  const handle = (signal: 'SIGINT' | 'SIGTERM', code: number): void => {
    process.on(signal, () => {
      void cleanupOnce().finally(() => {
        process.exit(code);
      });
    });
  };
  handle('SIGINT', 130);
  handle('SIGTERM', 143);
}

async function main(): Promise<number> {
  // Parse CLI flags
  let config;
  try {
    config = parseConfig(process.argv);
  } catch (err) {
    if (err instanceof HelpRequested) {
      process.stdout.write(HELP_TEXT);
      return 0;
    }
    if (err instanceof ConfigError) {
      process.stderr.write(err.message + '\n');
      return 1;
    }
    throw err;
  }

  registerSignalHandlers();

  try {
    // Check the git binary before anything that spawns git (including the
    // clone), so a missing git yields a friendly message instead of ENOENT.
    const gitResult = await validateGitBinary();
    if (!gitResult.valid) {
      process.stderr.write(gitResult.error + '\n');
      return 1;
    }

    // If repoPath is a URL, clone it to a temp directory
    const cloneInfo = await cloneIfUrl(config.repoPath);
    if (cloneInfo) {
      cloneToCleanup = cloneInfo.path;
      config.repoPath = cloneInfo.path;
      config.repoDisplayName = repoNameFromUrl(cloneInfo.url);
    }

    // Validate the target repository
    const repoResult = await validateRepo(config.repoPath);
    if (!repoResult.valid) {
      process.stderr.write(repoResult.error + '\n');
      return 1;
    }

    // Run the full analysis pipeline
    return await runAnalysis(config);
  } finally {
    // Clean up temp clone if we created one — reached on success, on
    // validation failure, and on thrown errors (no process.exit inside try)
    await cleanupOnce();
  }
}

main().then(
  (code) => {
    // Use exitCode (not process.exit) so pending stdout/stderr writes flush
    process.exitCode = code;
  },
  (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`Fatal error: ${message}\n`);
    process.exitCode = 1;
  },
);
