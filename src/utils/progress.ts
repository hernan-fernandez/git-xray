// Progress indicator and ETA calculation.
// Outputs to stderr so it doesn't interfere with stdout report.
// Uses \r for in-place line updates.

const ETA_THRESHOLD_MS = 10_000;

let currentPhase: string | null = null;
let phaseStartTime: number | null = null;

/**
 * Start tracking a new analysis phase.
 * Prints the phase name to stderr immediately.
 */
export function startPhase(name: string): void {
  currentPhase = name;
  phaseStartTime = Date.now();
  process.stderr.write(`\r\x1b[K${name}`);
}

/**
 * End the current phase and clear the progress line.
 */
export function endPhase(): void {
  if (currentPhase !== null) {
    process.stderr.write(`\r\x1b[K`);
  }
  currentPhase = null;
  phaseStartTime = null;
}

/**
 * Update the progress line with a custom message.
 * If the current phase has exceeded the ETA threshold (10 s),
 * an estimated time remaining is appended based on elapsed time
 * and an optional progress fraction.
 *
 * @param message - Status message to display
 * @param progress - Optional fraction in [0, 1] indicating completion.
 *                   When provided and > 0, used to estimate remaining time.
 */
export function updateProgress(message: string, progress?: number): void {
  let line = message;

  if (phaseStartTime !== null) {
    const elapsed = Date.now() - phaseStartTime;
    if (elapsed >= ETA_THRESHOLD_MS && progress !== undefined && progress > 0) {
      const estimatedTotal = elapsed / progress;
      const remaining = Math.max(0, estimatedTotal - elapsed);
      const remainingSec = Math.ceil(remaining / 1000);
      line += ` (ETA ~${remainingSec}s)`;
    }
  }

  process.stderr.write(`\r\x1b[K${line}`);
}
