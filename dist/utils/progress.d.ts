/**
 * Start tracking a new analysis phase.
 * Prints the phase name to stderr immediately.
 */
export declare function startPhase(name: string): void;
/**
 * End the current phase and clear the progress line.
 */
export declare function endPhase(): void;
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
export declare function updateProgress(message: string, progress?: number): void;
//# sourceMappingURL=progress.d.ts.map