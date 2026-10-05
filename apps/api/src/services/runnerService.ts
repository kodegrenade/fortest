import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { getBucketById } from './bucketService';
import { getStorageAdapter } from './storage';
import { interpolate, isFailedResult, parseFormPairs } from '@fortest/utils';
import { extractValue, stringify } from './extractionService';
import { evaluateAssertions } from './assertionService';
import type {
  StepResult,
  ExecutionRun,
  BucketVariable,
  ProxyResponse,
  AuthConfig,
  ExecutionConfig,
  AggregateMetrics,
  KeyValuePair,
  RunEvent,
  RunSummary,
} from '@fortest/types';

// Storage layout: run:<id> holds the summary (rewritten as the run progresses), run:<id>:results
// is a list the runner appends each step result to, runs:active indexes runs still in progress.
const runKey = (id: string) => `run:${id}`;
const resultsKey = (id: string) => `run:${id}:results`;
const ACTIVE_RUNS = 'runs:active';

const MAX_STORED_BODY = 1024 * 1024; // characters
const capBody = (body: string) =>
  body.length > MAX_STORED_BODY ? `${body.slice(0, MAX_STORED_BODY)}\n…[truncated at 1 MB]` : body;

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
  return { ...run, results: stored.length ? stored.map((r) => JSON.parse(r) as StepResult) : (run.results ?? []) };
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
 * Prefixes a step path with the bucket base URL. An absolute path (e.g. a Postman request
 * on a different host than the bucket's) is used as-is.
 */
export function joinUrl(baseUrl: string, path: string): string {
  if (!baseUrl || /^https?:\/\//i.test(path)) return path;
  if (path.startsWith('/')) return baseUrl.replace(/\/+$/, '') + path;
  return baseUrl.endsWith('/') ? baseUrl + path : `${baseUrl}/${path}`;
}

/** Interpolates the enabled pairs of a header, param or form-field list. */
function resolvePairs(pairs: KeyValuePair[], variables: BucketVariable[]): [string, string][] {
  return pairs
    .filter((p) => p.enabled)
    .map((p) => [interpolate(p.key, variables).resolved, interpolate(p.value, variables).resolved]);
}

/** Headers and query params contributed by an auth config. */
function resolveAuth(auth: AuthConfig, variables: BucketVariable[]) {
  const v = (s: string) => interpolate(s, variables).resolved;
  const headers: Record<string, string> = {};
  const query: [string, string][] = [];
  if (auth.type === 'bearer' && auth.bearer?.token) {
    headers['Authorization'] = `Bearer ${v(auth.bearer.token)}`;
  } else if (auth.type === 'basic' && auth.basic) {
    headers['Authorization'] = `Basic ${Buffer.from(`${v(auth.basic.username)}:${v(auth.basic.password)}`).toString('base64')}`;
  } else if (auth.type === 'api-key' && auth.apiKey) {
    const pair: [string, string] = [v(auth.apiKey.key), v(auth.apiKey.value)];
    if (auth.apiKey.addTo === 'query') query.push(pair);
    else headers[pair[0]] = pair[1];
  }
  return { headers, query };
}

/**
 * Orchestrates step execution loop for an ActionGroup.
 */
export async function runGroup(
  bucketId: string,
  groupId: string,
  runId: string,
  inputConfig: Partial<ExecutionConfig> | undefined,
  emitEvent: (event: RunEvent) => void
): Promise<void> {
  const bucket = await getBucketById(bucketId);
  if (!bucket) {
    throw new Error(`Bucket not found: ${bucketId}`);
  }

  const group = bucket.actionGroups.find((g) => g.id === groupId);
  if (!group) {
    throw new Error(`Action Group not found: ${groupId}`);
  }

  const iterations = inputConfig?.iterations ?? 1;
  const config: ExecutionConfig = {
    mode: inputConfig?.mode ?? (iterations > 1 ? 'load' : 'manual'),
    iterations,
    concurrency: inputConfig?.concurrency ?? 1,
    delayBetweenSteps: inputConfig?.delayBetweenSteps ?? 0,
    useDataStore: inputConfig?.useDataStore ?? false,
  };

  const run: RunSummary = {
    id: runId,
    bucketId,
    actionGroupId: groupId,
    actionGroupName: group.name,
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
  const cancelled = controller.signal;

  emitEvent({ type: 'run:started', runId, totalSteps: group.steps.length, totalIterations: config.iterations });

  const startTime = performance.now();
  const sortedSteps = [...group.steps].sort((a, b) => a.order - b.order);
  const records = config.useDataStore ? (group.dataStore?.records ?? []) : [];

  // Metrics only need these fields, so the run's response bodies never pile up in memory.
  const metricRows: Parameters<typeof computeMetrics>[0] = [];

  const recordResult = async (result: StepResult) => {
    const { status, responseTime, responseSize, error, assertions } = result;
    metricRows.push({ status, responseTime, responseSize, error, assertions });

    // Bodies are kept for single runs, the first iteration and failed steps; other load-test
    // results keep everything but the bodies.
    const keepBodies = config.iterations === 1 || result.iteration === 1 || isFailedResult(result);
    const stored: StepResult = keepBodies
      ? { ...result, responseBody: capBody(result.responseBody), requestBody: result.requestBody && capBody(result.requestBody) }
      : { ...result, responseBody: '', requestBody: undefined, bodyOmitted: !!(result.responseBody || result.requestBody) };

    await adapter.rpush(resultsKey(runId), JSON.stringify(stored));
    emitEvent({ type: 'step:finished', runId, result: stored });
  };

  const runSingleIteration = async (iteration: number) => {
    // Independent variable context per iteration: bucket variables, then this iteration's
    // data-store record (overrides them), then values extracted by earlier steps.
    const variables: BucketVariable[] = [...bucket.variables];
    for (const [key, val] of Object.entries(records[(iteration - 1) % records.length] ?? {})) {
      variables.push({ id: randomUUID(), key, value: stringify(val) ?? '', enabled: true });
    }
    const v = (s: string) => interpolate(s, variables).resolved;

    for (const step of sortedSteps) {
      if (cancelled.aborted) return;
      const stepStartTime = performance.now();
      const base = { stepId: step.id, stepName: step.name, iteration, method: step.method };
      let url = '';
      let requestBodyText: string | undefined;

      emitEvent({ type: 'step:started', runId, ...base });

      try {
        // 1. URL: path + enabled query params (+ api-key auth in the query)
        const auth = resolveAuth(step.auth.type !== 'none' ? step.auth : bucket.auth, variables);
        const query = [...resolvePairs(step.params, variables), ...auth.query]
          .map(([k, val]) => `${encodeURIComponent(k)}=${encodeURIComponent(val)}`)
          .join('&');
        const path = v(step.path);
        url = joinUrl(v(bucket.baseUrl), query ? `${path}${path.includes('?') ? '&' : '?'}${query}` : path);

        // 2. Headers (names are case-insensitive; users type them in any case)
        const headers: Record<string, string> = { ...Object.fromEntries(resolvePairs(step.headers, variables)), ...auth.headers };
        const contentTypeKeys = Object.keys(headers).filter((k) => k.toLowerCase() === 'content-type');
        if (step.body.type === 'json' && contentTypeKeys.length === 0) {
          headers['content-type'] = 'application/json';
        }

        // 3. Body. Form bodies are interpolated per field and then encoded, so variable values are escaped correctly.
        let body: string | URLSearchParams | FormData | undefined;
        if (step.body.type === 'form-data' || step.body.type === 'x-www-form-urlencoded') {
          const fields = resolvePairs(parseFormPairs(step.body.content).filter((p) => p.key.trim() !== ''), variables);
          requestBodyText = new URLSearchParams(fields).toString();
          if (step.body.type === 'form-data') {
            body = new FormData();
            for (const [k, val] of fields) body.append(k, val);
            // fetch must set multipart/form-data itself, with the boundary.
            for (const k of contentTypeKeys) delete headers[k];
          } else {
            body = new URLSearchParams(fields);
          }
        } else if (step.body.type !== 'none') {
          body = requestBodyText = v(step.body.content);
        }
        // fetch rejects a body on GET/HEAD; the editor allows one on any method, so drop it here.
        if (step.method === 'GET' || step.method === 'HEAD') body = requestBodyText = undefined;

        // 4. Execute
        const res = await fetch(url, {
          method: step.method,
          headers,
          body,
          signal: AbortSignal.any([AbortSignal.timeout(10_000), cancelled]),
          redirect: 'follow',
        });
        const time = Math.round(performance.now() - stepStartTime); // time to response headers
        const responseBody = await res.text();
        const response: ProxyResponse = {
          status: res.status,
          statusText: res.statusText,
          headers: Object.fromEntries(res.headers),
          body: responseBody,
          size: Buffer.byteLength(responseBody),
          time,
          contentType: res.headers.get('content-type') ?? 'application/octet-stream',
        };

        // 5. Extractions, injected into this iteration's context for downstream steps
        const extractedData: Record<string, string | null> = {};
        for (const rule of step.extractions) {
          if (!rule.variableName || (rule.source !== 'status' && !rule.selector)) continue;
          const value = extractValue(response, rule.source, rule.selector);
          extractedData[rule.variableName] = value;
          variables.push({ id: randomUUID(), key: `steps.${step.name}.${rule.variableName}`, value: value ?? '', enabled: true });
        }

        // 6. Assertions. Expected values may reference variables, e.g. {{defaultRole}} or {{steps.Login.userId}}.
        const assertions = evaluateAssertions(
          response,
          step.assertions.map((a) => ({ ...a, expected: v(a.expected) })),
        );

        await recordResult({
          ...base,
          status: res.status,
          statusText: res.statusText,
          responseTime: time,
          responseSize: response.size,
          responseHeaders: response.headers,
          responseBody,
          contentType: response.contentType,
          extractedData,
          assertions,
          requestBody: requestBodyText,
          timestamp: new Date().toISOString(),
          url,
        });
      } catch (stepErr) {
        if (cancelled.aborted) return; // stopped by the user: not a step failure
        const error = stepErr instanceof Error ? stepErr.message : 'Unknown network or execution error';
        const responseTime = Math.round(performance.now() - stepStartTime);
        url ||= step.path;

        await recordResult({
          ...base,
          status: 0,
          statusText: 'Failed',
          responseTime,
          responseSize: 0,
          responseHeaders: {},
          responseBody: '',
          contentType: 'text/plain',
          extractedData: {},
          assertions: [],
          error,
          requestBody: requestBodyText,
          timestamp: new Date().toISOString(),
          url,
        });

        // A failed request ends this iteration
        return;
      }

      if (config.delayBetweenSteps > 0) {
        await sleep(config.delayBetweenSteps, undefined, { signal: cancelled }).catch(() => {});
      }
    }
  };

  // Worker pool: `concurrency` workers pull iteration numbers until none are left.
  let nextIteration = 1;
  const worker = async () => {
    while (nextIteration <= config.iterations && !cancelled.aborted) {
      const iteration = nextIteration++;
      await runSingleIteration(iteration).catch((err) => console.error(`Error executing iteration ${iteration}:`, err));
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.min(config.concurrency, config.iterations) }, worker));
    run.status = cancelled.aborted ? 'cancelled' : 'completed';
    if (cancelled.aborted) run.error = 'Cancelled by user';
    run.metrics = computeMetrics(metricRows, performance.now() - startTime);
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
 * A result counts as failed on a network error, an HTTP error status, or any failed assertion.
 */
export function computeMetrics(
  results: Pick<StepResult, 'status' | 'responseTime' | 'responseSize' | 'error' | 'assertions'>[],
  durationMs: number,
): AggregateMetrics {
  const totalRequests = results.length;
  const failed = results.filter(isFailedResult).length;

  const latencies = results.map((r) => r.responseTime).sort((a, b) => a - b);
  // Nearest-rank percentile.
  const percentile = (p: number) => latencies[Math.ceil((p / 100) * latencies.length) - 1] ?? 0;

  return {
    totalRequests,
    completed: totalRequests - failed,
    failed,
    avgLatency: totalRequests > 0 ? latencies.reduce((acc, l) => acc + l, 0) / totalRequests : 0,
    minLatency: latencies[0] ?? 0,
    maxLatency: latencies[latencies.length - 1] ?? 0,
    p50: percentile(50),
    p95: percentile(95),
    p99: percentile(99),
    throughputPerSec: durationMs > 0 ? (totalRequests / durationMs) * 1000 : 0,
    errorRate: totalRequests > 0 ? (failed / totalRequests) * 100 : 0,
    totalDataTransferred: results.reduce((acc, r) => acc + r.responseSize, 0),
  };
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
