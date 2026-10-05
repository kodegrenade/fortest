import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { effectiveVariables, interpolate, isFailedResult, parseFormPairs } from '@fortest/utils';
import { extractValue, stringify } from './extractionService';
import { evaluateAssertions } from './assertionService';
import type {
  ActionGroup,
  AggregateMetrics,
  AuthConfig,
  BucketVariable,
  ExecutionConfig,
  KeyValuePair,
  ProxyResponse,
  RunEvent,
  StepResult,
  TestBucket,
} from '@fortest/types';

// The execution engine: runs an action group and reports events and results. No storage, so the
// API (which persists runs) and the CLI (which doesn't) run exactly the same code.

const MAX_STORED_BODY = 1024 * 1024; // characters
const capBody = (body: string) =>
  body.length > MAX_STORED_BODY ? `${body.slice(0, MAX_STORED_BODY)}\n…[truncated at 1 MB]` : body;

/** Fills in defaults; more than one iteration means a load run. */
export function resolveConfig(input: Partial<ExecutionConfig> = {}): ExecutionConfig {
  const iterations = input.iterations ?? 1;
  return {
    mode: input.mode ?? (iterations > 1 ? 'load' : 'manual'),
    iterations,
    concurrency: input.concurrency ?? 1,
    delayBetweenSteps: input.delayBetweenSteps ?? 0,
    useDataStore: input.useDataStore ?? false,
  };
}

/**
 * What a run keeps of a result: bodies for single runs, the first iteration and failed steps
 * (capped at 1 MB); other load-run results keep everything but the bodies.
 */
export function retainBodies(result: StepResult, config: ExecutionConfig): StepResult {
  const keepBodies = config.iterations === 1 || result.iteration === 1 || isFailedResult(result);
  return keepBodies
    ? {
        ...result,
        responseBody: capBody(result.responseBody),
        requestBody: result.requestBody && capBody(result.requestBody),
      }
    : {
        ...result,
        responseBody: '',
        requestBody: undefined,
        bodyOmitted: !!(result.responseBody || result.requestBody),
      };
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
    headers['Authorization'] =
      `Basic ${Buffer.from(`${v(auth.basic.username)}:${v(auth.basic.password)}`).toString('base64')}`;
  } else if (auth.type === 'api-key' && auth.apiKey) {
    const pair: [string, string] = [v(auth.apiKey.key), v(auth.apiKey.value)];
    if (auth.apiKey.addTo === 'query') query.push(pair);
    else headers[pair[0]] = pair[1];
  }
  return { headers, query };
}

export interface ExecuteOptions {
  runId: string;
  config: ExecutionConfig;
  /** Aborting stops the run between steps (the request in flight is dropped, not recorded). */
  signal: AbortSignal;
  /** run:started, step:started and step:finished (run:finished is the caller's, once it has saved). */
  emit: (event: RunEvent) => void;
  /** Called with each (retained) result before its step:finished event, e.g. to persist it. */
  onResult?: (result: StepResult) => Promise<void> | void;
  /** Environment to use: undefined = the bucket's active one, null = none. */
  environmentId?: string | null;
  /** Variables that beat everything else, e.g. the CLI's --var. */
  overrides?: BucketVariable[];
}

export interface ExecuteOutcome {
  status: 'completed' | 'cancelled';
  metrics: AggregateMetrics;
}

/** Runs an action group: `iterations` passes over its steps, `concurrency` at a time. */
export async function executeGroup(
  bucket: TestBucket,
  group: ActionGroup,
  { runId, config, signal: cancelled, emit, onResult, environmentId, overrides = [] }: ExecuteOptions,
): Promise<ExecuteOutcome> {
  emit({
    type: 'run:started',
    runId,
    totalSteps: group.steps.length,
    totalIterations: config.iterations,
  });

  const startTime = performance.now();
  const sortedSteps = [...group.steps].sort((a, b) => a.order - b.order);
  const records = config.useDataStore ? (group.dataStore?.records ?? []) : [];
  const baseVariables = effectiveVariables(bucket, environmentId === undefined ? bucket.activeEnvironmentId : environmentId);

  // Metrics only need these fields, so the run's response bodies never pile up in memory.
  const metricRows: Parameters<typeof computeMetrics>[0] = [];

  const recordResult = async (result: StepResult) => {
    const { status, responseTime, responseSize, error, assertions } = result;
    metricRows.push({ status, responseTime, responseSize, error, assertions });
    const stored = retainBodies(result, config);
    await onResult?.(stored);
    emit({ type: 'step:finished', runId, result: stored });
  };

  const runSingleIteration = async (iteration: number) => {
    // Independent variable context per iteration. Later entries win: bucket variables, the
    // environment's, this iteration's data-store record, overrides, then values extracted by earlier steps.
    const variables: BucketVariable[] = [...baseVariables];
    for (const [key, val] of Object.entries(records[(iteration - 1) % records.length] ?? {})) {
      variables.push({ id: randomUUID(), key, value: stringify(val) ?? '', enabled: true });
    }
    variables.push(...overrides);
    const v = (s: string) => interpolate(s, variables).resolved;

    for (const step of sortedSteps) {
      if (cancelled.aborted) return;
      const stepStartTime = performance.now();
      const base = { stepId: step.id, stepName: step.name, iteration, method: step.method };
      let url = '';
      let requestBodyText: string | undefined;

      emit({ type: 'step:started', runId, ...base });

      try {
        // 1. URL: path + enabled query params (+ api-key auth in the query)
        const auth = resolveAuth(step.auth.type !== 'none' ? step.auth : bucket.auth, variables);
        const query = [...resolvePairs(step.params, variables), ...auth.query]
          .map(([k, val]) => `${encodeURIComponent(k)}=${encodeURIComponent(val)}`)
          .join('&');
        const path = v(step.path);
        url = joinUrl(
          v(bucket.baseUrl),
          query ? `${path}${path.includes('?') ? '&' : '?'}${query}` : path,
        );

        // 2. Headers (names are case-insensitive; users type them in any case)
        const headers: Record<string, string> = {
          ...Object.fromEntries(resolvePairs(step.headers, variables)),
          ...auth.headers,
        };
        const contentTypeKeys = Object.keys(headers).filter(
          (k) => k.toLowerCase() === 'content-type',
        );
        if (step.body.type === 'json' && contentTypeKeys.length === 0) {
          headers['content-type'] = 'application/json';
        }

        // 3. Body. Form bodies are interpolated per field and then encoded, so variable values are escaped correctly.
        let body: string | URLSearchParams | FormData | undefined;
        if (step.body.type === 'form-data' || step.body.type === 'x-www-form-urlencoded') {
          const fields = resolvePairs(
            parseFormPairs(step.body.content).filter((p) => p.key.trim() !== ''),
            variables,
          );
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
          variables.push({
            id: randomUUID(),
            key: `steps.${step.name}.${rule.variableName}`,
            value: value ?? '',
            enabled: true,
          });
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
        const error =
          stepErr instanceof Error ? stepErr.message : 'Unknown network or execution error';
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
      await runSingleIteration(iteration).catch((err) =>
        console.error(`Error executing iteration ${iteration}:`, err),
      );
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(config.concurrency, config.iterations) }, worker),
  );
  return {
    status: cancelled.aborted ? 'cancelled' : 'completed',
    metrics: computeMetrics(metricRows, performance.now() - startTime),
  };
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
