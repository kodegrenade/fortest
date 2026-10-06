import type { RunSummary } from '@fortest/types';

/** A run is flagged when its p95 is more than this much slower than usual... */
export const REGRESSION_RATIO = 1.5;
/** ...and at least this many ms slower (so 4 ms → 7 ms isn't an alarm). */
export const REGRESSION_MIN_MS = 50;
/** Recent comparable runs that make up "usual". */
export const REGRESSION_WINDOW = 10;
/** Fewer comparable runs than this: no verdict yet. */
export const REGRESSION_MIN_RUNS = 3;

/**
 * Compares a finished run's p95 with the median p95 of the group's recent comparable runs:
 * completed, same environment, same run type (single vs load). `history` is newest first.
 */
export function detectRegression(run: RunSummary, history: RunSummary[]): RunSummary['regression'] {
  if (!run.metrics) return undefined;
  const comparable = history
    .filter(
      (r) =>
        r.id !== run.id &&
        r.status === 'completed' &&
        r.metrics &&
        r.metrics.totalRequests > 0 &&
        r.environmentName === run.environmentName &&
        r.config.mode === run.config.mode,
    )
    .slice(0, REGRESSION_WINDOW);
  if (comparable.length < REGRESSION_MIN_RUNS) return undefined;

  const p95s = comparable.map((r) => r.metrics!.p95).sort((a, b) => a - b);
  const mid = Math.floor(p95s.length / 2);
  const baselineP95 = p95s.length % 2 ? p95s[mid]! : (p95s[mid - 1]! + p95s[mid]!) / 2;
  const { p95 } = run.metrics;

  return p95 > baselineP95 * REGRESSION_RATIO && p95 - baselineP95 >= REGRESSION_MIN_MS
    ? { p95, baselineP95, comparedRuns: comparable.length }
    : undefined;
}
