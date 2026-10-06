import type { ExecutionRun, RunEvent, StepResult } from '@fortest/types';

const EXECUTING = 'Executing...';
const slot = (r: { stepId: string; iteration: number }) => `${r.stepId}:${r.iteration}`;
const isTerminal = (run: ExecutionRun) => run.status !== 'running' && run.status !== 'pending';

/** Inserts or replaces a result by (step, iteration). A placeholder never replaces a finished result. */
function upsert(results: StepResult[], result: StepResult): StepResult[] {
  // Searching from the end: live events are almost always about the newest results.
  for (let i = results.length - 1; i >= 0; i--) {
    if (slot(results[i]!) !== slot(result)) continue;
    if (result.statusText === EXECUTING && results[i]!.statusText !== EXECUTING) return results;
    const next = [...results];
    next[i] = result;
    return next;
  }
  return [...results, result];
}

/** Merges a snapshot's results into what the client already has (finished results win). */
function merge(existing: StepResult[], snapshot: StepResult[]): StepResult[] {
  const bySlot = new Map(existing.map((r) => [slot(r), r]));
  for (const r of snapshot) {
    const current = bySlot.get(slot(r));
    if (!current || current.statusText === EXECUTING) bySlot.set(slot(r), r);
  }
  return [...bySlot.values()];
}

/**
 * Applies a live run event to the client's copy of a run. Events can arrive around the snapshot
 * in any order, so a snapshot merges rather than replaces, and a finished status is never undone.
 */
export function applyRunEvent(run: ExecutionRun | null, event: RunEvent): ExecutionRun | null {
  if (event.type === 'run:snapshot') {
    if (!run) return event.run;
    const summary = isTerminal(run) ? run : event.run;
    return { ...event.run, ...summary, results: merge(run.results, event.run.results) };
  }
  if (!run) return null;

  switch (event.type) {
    case 'run:started':
      return run;
    case 'step:started':
      return {
        ...run,
        results: upsert(run.results, {
          stepId: event.stepId,
          stepName: event.stepName,
          iteration: event.iteration,
          method: event.method,
          status: 0,
          statusText: EXECUTING,
          responseTime: 0,
          responseSize: 0,
          responseHeaders: {},
          responseBody: '',
          contentType: '',
          extractedData: {},
          assertions: [],
          timestamp: new Date().toISOString(),
          url: '',
        }),
      };
    case 'step:finished':
      return { ...run, results: upsert(run.results, event.result) };
    case 'run:finished':
      return { ...run, ...event.run, results: run.results };
  }
}
