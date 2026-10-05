import { getBucketById } from './bucketService';
import { getStorageAdapter } from './storage';
import { executeGroup, resolveConfig } from './executor';
import { activeEnvironment, detectRegression } from '@fortest/utils';
import type {
  StepResult,
  ExecutionRun,
  ExecutionConfig,
  RunEvent,
  RunSummary,
} from '@fortest/types';

// Storage layout: run:<id> holds the summary (rewritten as the run progresses), run:<id>:results
// is a list the runner appends each step result to, runs:active indexes runs still in progress.
const runKey = (id: string) => `run:${id}`;
const resultsKey = (id: string) => `run:${id}:results`;
const ACTIVE_RUNS = 'runs:active';

// Runs executing in this process, so they can be cancelled.
const activeRuns = new Map<string, AbortController>();

async function readRun(runId: string): Promise<ExecutionRun | null> {
  const data = await getStorageAdapter().get(runKey(runId));
  return data ? (JSON.parse(data) as ExecutionRun) : null;
}

/** A run without its step results (cheap: used for history lists). */
export async function getRunSummary(runId: string): Promise<RunSummary | null> {
  const run = await readRun(runId);
  if (!run) return null;
  const { results: _legacyResults, ...summary } = run;
  return summary;
}

/** A run with all its stored step results. */
export async function getRunById(runId: string): Promise<ExecutionRun | null> {
  const run = await readRun(runId);
  if (!run) return null;
  const stored = await getStorageAdapter().lrange(resultsKey(runId), 0, -1);
  // Runs saved before results moved to their own list kept them inline.
  return {
    ...run,
    results: stored.length ? stored.map((r) => JSON.parse(r) as StepResult) : (run.results ?? []),
  };
}

async function saveSummary(run: RunSummary): Promise<void> {
  await getStorageAdapter().set(runKey(run.id), JSON.stringify(run));
}

/** Stops a run in progress. False if it isn't running in this process. */
export function cancelRun(runId: string): boolean {
  activeRuns.get(runId)?.abort();
  return activeRuns.has(runId);
}

/** Runs left "running" by a crash or restart can never finish: mark them failed. Call at startup. */
export async function failOrphanedRuns(): Promise<void> {
  const adapter = getStorageAdapter();
  for (const runId of await adapter.smembers(ACTIVE_RUNS)) {
    const run = await getRunSummary(runId);
    if (run?.status === 'running') {
      await saveSummary({
        ...run,
        status: 'failed',
        error: 'Interrupted: the server stopped while this run was in progress.',
        completedAt: new Date().toISOString(),
      });
    }
    await adapter.srem(ACTIVE_RUNS, runId);
  }
}

/**
 * Runs an action group as a stored run: persists the summary and each result, streams events,
 * and can be cancelled with cancelRun().
 */
export async function runGroup(
  bucketId: string,
  groupId: string,
  runId: string,
  inputConfig: Partial<ExecutionConfig> | undefined,
  emitEvent: (event: RunEvent) => void,
): Promise<void> {
  const bucket = await getBucketById(bucketId);
  if (!bucket) {
    throw new Error(`Bucket not found: ${bucketId}`);
  }

  const group = bucket.actionGroups.find((g) => g.id === groupId);
  if (!group) {
    throw new Error(`Action Group not found: ${groupId}`);
  }

  const config = resolveConfig(inputConfig);
  const run: RunSummary = {
    id: runId,
    bucketId,
    actionGroupId: groupId,
    actionGroupName: group.name,
    environmentName: activeEnvironment(bucket)?.name,
    config,
    status: 'running',
    startedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  const adapter = getStorageAdapter();
  await saveSummary(run);
  await adapter.sadd(ACTIVE_RUNS, runId);
  await adapter.zadd(`group:${groupId}:runs`, Date.now(), runId);

  const controller = new AbortController();
  activeRuns.set(runId, controller);
  const startTime = performance.now();

  try {
    const outcome = await executeGroup(bucket, group, {
      runId,
      config,
      signal: controller.signal,
      emit: emitEvent,
      onResult: (result) => adapter.rpush(resultsKey(runId), JSON.stringify(result)),
    });
    run.status = outcome.status;
    run.metrics = outcome.metrics;
    if (outcome.status === 'cancelled') run.error = 'Cancelled by user';
    // Only full runs are judged: a cancelled run's p95 says little.
    else run.regression = detectRegression(run, await getGroupRuns(groupId));
  } catch (err) {
    console.error(`Execution failed for run ${runId}`, err);
    run.status = 'failed';
    run.error = err instanceof Error ? err.message : 'Unknown execution error';
  } finally {
    activeRuns.delete(runId);
    run.completedAt = new Date().toISOString();
    run.duration = Math.round(performance.now() - startTime);
    await saveSummary(run);
    await adapter.srem(ACTIVE_RUNS, runId);
    emitEvent({ type: 'run:finished', runId, run });
    trimOldRuns(groupId).catch((e) => console.error('Error trimming runs:', e));
  }
}

/**
 * Trims historical runs list for an Action Group, keeping only the 50 most recent runs.
 */
async function trimOldRuns(groupId: string): Promise<void> {
  const adapter = getStorageAdapter();
  const runsKey = `group:${groupId}:runs`;
  const limit = 50;
  try {
    const count = await adapter.zcard(runsKey);
    if (count > limit) {
      // zrevrange fetches highest score (newest) first.
      // Index 50 to -1 are the 51st and older runs.
      const runsToRemove = await adapter.zrevrange(runsKey, limit, -1);
      for (const oldId of runsToRemove) {
        await adapter.del(runKey(oldId));
        await adapter.del(resultsKey(oldId));
      }
      // Trim sorted set: remove the oldest (ranks 0 to count - limit - 1)
      await adapter.zremrangebyrank(runsKey, 0, count - limit - 1);
    }
  } catch (err) {
    console.error(`Failed to trim old runs for group ${groupId}:`, err);
  }
}

/**
 * The history list for an Action Group, newest first: summaries only, no step results.
 */
export async function getGroupRuns(groupId: string): Promise<RunSummary[]> {
  const runIds = await getStorageAdapter().zrevrange(`group:${groupId}:runs`, 0, -1);
  const summaries = await Promise.all(runIds.map(getRunSummary));
  return summaries.filter((r): r is RunSummary => r !== null);
}
