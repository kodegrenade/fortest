import crypto from 'crypto';
import { getBucketById } from './bucketService';
import { getStorageAdapter } from './storage';
import { interpolate } from '@fortest/utils';
import { validateTargetUrl } from '../middleware/security';
import { extractValue } from './extractionService';
import { evaluateAssertions } from './assertionService';
import type {
  StepResult,
  ExecutionRun,
  BucketVariable,
  ProxyResponse,
  AuthConfig,
  ExecutionConfig,
} from '@fortest/types';

/**
 * Retrieves a historical or active execution run by ID.
 */
export async function getRunById(runId: string): Promise<ExecutionRun | null> {
  const adapter = getStorageAdapter();
  const data = await adapter.get(`run:${runId}`);
  if (!data) return null;
  try {
    return JSON.parse(data) as ExecutionRun;
  } catch {
    return null;
  }
}

/**
 * Saves or updates an execution run.
 */
export async function saveRun(run: ExecutionRun): Promise<void> {
  const adapter = getStorageAdapter();
  await adapter.set(`run:${run.id}`, JSON.stringify(run));
}

/**
 * Helper to build authorization headers based on AuthConfig and active variables.
 */
function resolveAuthHeaders(auth: AuthConfig, variables: BucketVariable[]): Record<string, string> {
  const headers: Record<string, string> = {};
  if (auth.type === 'bearer' && auth.bearer?.token) {
    const token = interpolate(auth.bearer.token, variables).resolved;
    headers['Authorization'] = `Bearer ${token}`;
  } else if (auth.type === 'basic' && auth.basic) {
    const username = interpolate(auth.basic.username, variables).resolved;
    const password = interpolate(auth.basic.password, variables).resolved;
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');
    headers['Authorization'] = `Basic ${credentials}`;
  } else if (auth.type === 'api-key' && auth.apiKey && auth.apiKey.addTo === 'header') {
    const key = interpolate(auth.apiKey.key, variables).resolved;
    const value = interpolate(auth.apiKey.value, variables).resolved;
    headers[key] = value;
  }
  return headers;
}

/**
 * Orchestrates step execution loop for an ActionGroup.
 */
export async function runGroup(
  bucketId: string,
  groupId: string,
  runId: string,
  inputConfig: Partial<ExecutionConfig> | undefined,
  emitEvent: (event: any) => void
): Promise<void> {
  const bucket = await getBucketById(bucketId);
  if (!bucket) {
    throw new Error(`Bucket not found: ${bucketId}`);
  }

  const group = bucket.actionGroups.find((g) => g.id === groupId);
  if (!group) {
    throw new Error(`Action Group not found: ${groupId}`);
  }

  const config: ExecutionConfig = {
    mode: inputConfig?.mode || (inputConfig?.iterations && inputConfig.iterations > 1 ? 'load' : 'manual'),
    iterations: inputConfig?.iterations || 1,
    concurrency: inputConfig?.concurrency || 1,
    delayBetweenSteps: inputConfig?.delayBetweenSteps || 0,
    useDataStore: inputConfig?.useDataStore || false,
  };

  const run: ExecutionRun = {
    id: runId,
    bucketId,
    actionGroupId: groupId,
    actionGroupName: group.name,
    config,
    status: 'running',
    results: [],
    startedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  await saveRun(run);

  // Give the WebSocket client a moment to connect and subscribe
  await new Promise((resolve) => setTimeout(resolve, 100));

  emitEvent({
    type: 'run:started',
    runId,
    timestamp: new Date().toISOString(),
    totalSteps: group.steps.length,
    totalIterations: config.iterations,
  });

  const startTime = performance.now();

  const totalIterations = config.iterations;
  const maxConcurrency = Math.min(config.concurrency, totalIterations);
  const delay = config.delayBetweenSteps;

  const queue: number[] = Array.from({ length: totalIterations }, (_, i) => i + 1);

  const runSingleIteration = async (iterNum: number) => {
    // 1. Independent variable context for this iteration
    const iterVariables: BucketVariable[] = [...(bucket.variables || [])];

    // 2. Inject Data Store record if enabled
    if (config.useDataStore && group.dataStore && group.dataStore.records.length > 0) {
      const records = group.dataStore.records;
      const record = records[(iterNum - 1) % records.length];
      if (record) {
        for (const [key, val] of Object.entries(record)) {
          iterVariables.push({
            id: crypto.randomUUID(),
            key,
            value: typeof val === 'object' && val !== null ? JSON.stringify(val) : String(val),
            enabled: true,
          });
        }
      }
    }

    const sortedSteps = [...group.steps].sort((a, b) => a.order - b.order);

    for (const step of sortedSteps) {
      emitEvent({
        type: 'step:started',
        runId,
        stepId: step.id,
        stepName: step.name,
        iteration: iterNum,
      });

      // 1. Resolve interpolation context
      const resPath = interpolate(step.path || '', iterVariables).resolved;
      
      // Resolve Query parameters
      const resolvedParams: string[] = [];
      for (const p of step.params || []) {
        if (!p.enabled) continue;
        const resKey = interpolate(p.key, iterVariables).resolved;
        const resVal = interpolate(p.value, iterVariables).resolved;
        resolvedParams.push(`${encodeURIComponent(resKey)}=${encodeURIComponent(resVal)}`);
      }

      // Add query param auth if applicable
      const activeAuth = step.auth && step.auth.type !== 'none' ? step.auth : bucket.auth;
      if (activeAuth.type === 'api-key' && activeAuth.apiKey && activeAuth.apiKey.addTo === 'query') {
        const key = interpolate(activeAuth.apiKey.key, iterVariables).resolved;
        const value = interpolate(activeAuth.apiKey.value, iterVariables).resolved;
        resolvedParams.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
      }

      let finalPath = resPath;
      if (resolvedParams.length > 0) {
        finalPath += (finalPath.includes('?') ? '&' : '?') + resolvedParams.join('&');
      }

      const resBaseUrl = interpolate(bucket.baseUrl || '', iterVariables).resolved;
      let finalUrl = resBaseUrl;
      if (finalUrl && !finalUrl.endsWith('/') && !finalPath.startsWith('/')) {
        finalUrl += '/';
      }
      finalUrl += finalPath;

      // 2. Validate URL against SSRF
      const isSafeUrl = await validateTargetUrl(finalUrl);
      if (!isSafeUrl) {
        throw new Error(`SSRF Blocked: URL target is loopback/private IP: ${finalUrl}`);
      }

      // 3. Resolve request headers
      const resolvedHeaders: Record<string, string> = {};
      for (const h of step.headers || []) {
        if (!h.enabled) continue;
        const resKey = interpolate(h.key, iterVariables).resolved;
        const resVal = interpolate(h.value, iterVariables).resolved;
        resolvedHeaders[resKey] = resVal;
      }

      // Merge auth headers
      const authHeaders = resolveAuthHeaders(activeAuth, iterVariables);
      Object.assign(resolvedHeaders, authHeaders);

      // Default JSON content type if JSON body
      if (step.body && step.body.type === 'json' && !resolvedHeaders['content-type']) {
        resolvedHeaders['content-type'] = 'application/json';
      }

      // 4. Resolve Body Content
      let finalBody: string | undefined = undefined;
      if (step.body && step.body.type !== 'none') {
        finalBody = interpolate(step.body.content, iterVariables).resolved;
      }

      // 5. Execute HTTP Request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const stepStartTime = performance.now();

      try {
        let fetchResponse: Response;
        try {
          fetchResponse = await fetch(finalUrl, {
            method: step.method,
            headers: resolvedHeaders,
            body: finalBody ?? undefined,
            signal: controller.signal,
            redirect: 'follow',
          });
        } finally {
          clearTimeout(timeoutId);
        }

        const stepElapsed = performance.now() - stepStartTime;
        const responseBody = await fetchResponse.text();

        const responseHeaders: Record<string, string> = {};
        fetchResponse.headers.forEach((val, key) => {
          responseHeaders[key] = val;
        });

        const contentType = responseHeaders['content-type'] ?? 'application/octet-stream';

        const proxyResponse: ProxyResponse = {
          status: fetchResponse.status,
          statusText: fetchResponse.statusText,
          headers: responseHeaders,
          body: responseBody,
          size: new TextEncoder().encode(responseBody).byteLength,
          time: Math.round(stepElapsed),
          contentType,
        };

        // 6. Perform Extractions
        const extractedData: Record<string, any> = {};
        for (const rule of step.extractions || []) {
          if (!rule.variableName || !rule.selector) continue;
          const value = extractValue(proxyResponse, rule.source, rule.selector);
          extractedData[rule.variableName] = value;
          // Inject into current iteration variable context for downstream steps
          iterVariables.push({
            id: crypto.randomUUID(),
            key: `steps.${step.name}.${rule.variableName}`,
            value: value || '',
            enabled: true,
          });
        }

        // 7. Evaluate Assertions
        const assertionResults = evaluateAssertions(proxyResponse, step.assertions || []);

        // 8. Construct Step Result
        const stepResult: StepResult = {
          stepId: step.id,
          stepName: step.name,
          iteration: iterNum,
          status: fetchResponse.status,
          statusText: fetchResponse.statusText,
          responseTime: Math.round(stepElapsed),
          responseSize: proxyResponse.size,
          responseHeaders,
          responseBody,
          contentType,
          extractedData,
          assertions: assertionResults,
          timestamp: new Date().toISOString(),
          url: finalUrl,
          method: step.method,
        };

        run.results.push(stepResult);
        await saveRun(run);

        emitEvent({
          type: 'step:completed',
          runId,
          stepId: step.id,
          stepName: step.name,
          iteration: iterNum,
          statusCode: fetchResponse.status,
          responseTime: Math.round(stepElapsed),
          extractedData,
          assertions: assertionResults,
          url: finalUrl,
          method: step.method,
        });
      } catch (stepErr: any) {
        const stepElapsed = performance.now() - stepStartTime;
        const stepResult: StepResult = {
          stepId: step.id,
          stepName: step.name,
          iteration: iterNum,
          status: 0,
          statusText: 'Failed',
          responseTime: Math.round(stepElapsed),
          responseSize: 0,
          responseHeaders: {},
          responseBody: '',
          contentType: 'text/plain',
          extractedData: {},
          assertions: [],
          error: stepErr.message || 'Unknown network or execution error',
          timestamp: new Date().toISOString(),
          url: finalUrl,
          method: step.method,
        };

        run.results.push(stepResult);
        await saveRun(run);

        emitEvent({
          type: 'step:failed',
          runId,
          stepId: step.id,
          stepName: step.name,
          iteration: iterNum,
          error: stepErr.message || 'Unknown network or execution error',
          responseTime: Math.round(stepElapsed),
          url: finalUrl,
          method: step.method,
        });

        // Break out of steps loop for this iteration
        return;
      }

      // Delay between steps within one iteration
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  };

  const runNextIteration = async (): Promise<void> => {
    if (queue.length === 0) return;
    const iterNum = queue.shift()!;
    try {
      await runSingleIteration(iterNum);
    } catch (err) {
      console.error(`Error executing iteration ${iterNum}:`, err);
    }
    await runNextIteration();
  };

  try {
    // Spawn maxConcurrency parallel consumer flows
    const workers: Promise<void>[] = [];
    for (let w = 0; w < maxConcurrency; w++) {
      workers.push(runNextIteration());
    }
    await Promise.all(workers);

    // After all iterations are complete:
    const duration = performance.now() - startTime;
    run.status = 'completed';
    run.completedAt = new Date().toISOString();
    run.duration = Math.round(duration);

    // Compute aggregate metrics
    const totalRequests = run.results.length;
    const failed = run.results.filter(
      (r) => r.status >= 400 || r.status === 0 || r.error || r.assertions.some((a) => !a.passed)
    ).length;
    const completed = totalRequests - failed;

    const latencies = run.results.map((r) => r.responseTime).sort((a, b) => a - b);
    const avgLatency = totalRequests > 0 ? latencies.reduce((acc, l) => acc + l, 0) / totalRequests : 0;

    const getPercentile = (sorted: number[], p: number): number => {
      if (sorted.length === 0) return 0;
      const idx = Math.ceil((p / 100) * sorted.length) - 1;
      return sorted[idx] ?? 0;
    };

    run.metrics = {
      totalRequests,
      completed,
      failed,
      avgLatency,
      minLatency: latencies.length > 0 ? latencies[0]! : 0,
      maxLatency: latencies.length > 0 ? latencies[latencies.length - 1]! : 0,
      p50: getPercentile(latencies, 50),
      p95: getPercentile(latencies, 95),
      p99: getPercentile(latencies, 99),
      throughputPerSec: duration > 0 ? (totalRequests / duration) * 1000 : 0,
      errorRate: totalRequests > 0 ? (failed / totalRequests) * 100 : 0,
      totalDataTransferred: run.results.reduce((acc, r) => acc + r.responseSize, 0),
    };

    await saveRun(run);

    emitEvent({
      type: 'run:completed',
      runId,
      summary: {
        totalRequests,
        completed,
        failed,
      },
      duration: Math.round(duration),
    });

  } catch (err: any) {
    const elapsed = performance.now() - startTime;
    console.error(`Execution failed for run ${runId}`, err);

    run.status = 'failed';
    run.completedAt = new Date().toISOString();
    run.duration = Math.round(elapsed);
    await saveRun(run);

    emitEvent({
      type: 'run:failed',
      runId,
      error: err.message || 'Unknown execution error',
    });
  }
}
