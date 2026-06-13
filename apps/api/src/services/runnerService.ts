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

  const run: ExecutionRun = {
    id: runId,
    bucketId,
    actionGroupId: groupId,
    actionGroupName: group.name,
    config: {
      mode: 'manual',
      iterations: 1,
      concurrency: 1,
      delayBetweenSteps: 0,
      useDataStore: false,
    },
    status: 'running',
    results: [],
    startedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  await saveRun(run);

  // Give the WebSocket client a moment to connect and subscribe
  await new Promise((resolve) => setTimeout(resolve, 100));

  // Initialize active variables dictionary from bucket
  const activeVariables: BucketVariable[] = [...(bucket.variables || [])];

  emitEvent({
    type: 'run:started',
    runId,
    timestamp: new Date().toISOString(),
    totalSteps: group.steps.length,
    totalIterations: 1,
  });

  const startTime = performance.now();

  try {
    const sortedSteps = [...group.steps].sort((a, b) => a.order - b.order);

    for (const step of sortedSteps) {
      emitEvent({
        type: 'step:started',
        runId,
        stepId: step.id,
        stepName: step.name,
        iteration: 1,
      });

      // 1. Resolve interpolation context
      const resPath = interpolate(step.path || '', activeVariables).resolved;
      
      // Resolve Query parameters
      const resolvedParams: string[] = [];
      for (const p of step.params || []) {
        if (!p.enabled) continue;
        const resKey = interpolate(p.key, activeVariables).resolved;
        const resVal = interpolate(p.value, activeVariables).resolved;
        resolvedParams.push(`${encodeURIComponent(resKey)}=${encodeURIComponent(resVal)}`);
      }

      // Add query param auth if applicable
      const activeAuth = step.auth && step.auth.type !== 'none' ? step.auth : bucket.auth;
      if (activeAuth.type === 'api-key' && activeAuth.apiKey && activeAuth.apiKey.addTo === 'query') {
        const key = interpolate(activeAuth.apiKey.key, activeVariables).resolved;
        const value = interpolate(activeAuth.apiKey.value, activeVariables).resolved;
        resolvedParams.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
      }

      let finalPath = resPath;
      if (resolvedParams.length > 0) {
        finalPath += (finalPath.includes('?') ? '&' : '?') + resolvedParams.join('&');
      }

      const resBaseUrl = interpolate(bucket.baseUrl || '', activeVariables).resolved;
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
        const resKey = interpolate(h.key, activeVariables).resolved;
        const resVal = interpolate(h.value, activeVariables).resolved;
        resolvedHeaders[resKey] = resVal;
      }

      // Merge auth headers
      const authHeaders = resolveAuthHeaders(activeAuth, activeVariables);
      Object.assign(resolvedHeaders, authHeaders);

      // Default JSON content type if JSON body
      if (step.body && step.body.type === 'json' && !resolvedHeaders['content-type']) {
        resolvedHeaders['content-type'] = 'application/json';
      }

      // 4. Resolve Body Content
      let finalBody: string | undefined = undefined;
      if (step.body && step.body.type !== 'none') {
        finalBody = interpolate(step.body.content, activeVariables).resolved;
      }

      // 5. Execute HTTP Request
      const controller = new AbortController();
      // Default timeout is 10000ms
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      const stepStartTime = performance.now();

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
        // Inject into current execution context for downstream steps
        activeVariables.push({
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
        iteration: 1,
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
      };

      run.results.push(stepResult);
      await saveRun(run);

      emitEvent({
        type: 'step:completed',
        runId,
        stepId: step.id,
        stepName: step.name,
        iteration: 1,
        statusCode: fetchResponse.status,
        responseTime: Math.round(stepElapsed),
        extractedData,
        assertions: assertionResults,
      });
    }

    // Run completed successfully
    const duration = performance.now() - startTime;
    run.status = 'completed';
    run.completedAt = new Date().toISOString();
    run.duration = Math.round(duration);

    // Compute simple manual aggregate metrics
    const totalRequests = run.results.length;
    const failed = run.results.filter((r) => r.status >= 400 || r.error || r.assertions.some((a) => !a.passed)).length;
    const completed = totalRequests - failed;
    const avgLatency = totalRequests > 0 ? run.results.reduce((acc, r) => acc + r.responseTime, 0) / totalRequests : 0;

    run.metrics = {
      totalRequests,
      completed,
      failed,
      avgLatency,
      minLatency: totalRequests > 0 ? Math.min(...run.results.map((r) => r.responseTime)) : 0,
      maxLatency: totalRequests > 0 ? Math.max(...run.results.map((r) => r.responseTime)) : 0,
      p50: avgLatency, // Fallbacks for simple manual runs
      p95: avgLatency,
      p99: avgLatency,
      throughputPerSec: duration > 0 ? (totalRequests / duration) * 1000 : 0,
      errorRate: totalRequests > 0 ? (failed / totalRequests) * 10000 : 0, // In basis points or percentage
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

    // If an error stopped execution, append it to the run
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
