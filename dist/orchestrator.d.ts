import type { GitPeekConfig } from './config.js';
import { type NameStatusCommit } from './analyzers/hotspots.js';
/**
 * Parse raw name-status git log output into NameStatusCommit[].
 * Format:
 *   <hash>
 *   <status>\t<filepath>
 *   ...
 *   (blank line)
 *   <hash>
 *   ...
 */
export declare function parseNameStatusOutput(raw: string): NameStatusCommit[];
/**
 * Run the full analysis pipeline.
 *
 * Phases run sequentially: contributions → hotspots → complexity → bus factor → PR velocity.
 * Each phase is wrapped in try/catch for graceful degradation.
 * After all phases, results are aggregated and rendered.
 */
export declare function runAnalysis(config: GitPeekConfig): Promise<void>;
//# sourceMappingURL=orchestrator.d.ts.map