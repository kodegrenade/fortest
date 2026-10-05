import { z } from 'zod';

// --- Execution Configuration ---

export const ExecutionModeSchema = z.enum(['manual', 'load']);
export type ExecutionMode = z.infer<typeof ExecutionModeSchema>;

export const ExecutionConfigSchema = z.object({
  mode: ExecutionModeSchema.default('manual'),
  iterations: z.number().int().positive().max(10000).default(1), // number of times to run the action group
  concurrency: z.number().int().positive().max(100).default(1), // how many iterations run in parallel
  delayBetweenSteps: z.number().int().min(0).max(60000).default(0), // ms delay between steps within one iteration
  useDataStore: z.boolean().default(false), // whether to drive iterations from a data store
});
export type ExecutionConfig = z.infer<typeof ExecutionConfigSchema>;

// --- Assertion Result ---

export const AssertionResultSchema = z.object({
  assertionId: z.string().uuid(),
  passed: z.boolean(),
  actual: z.string(),
  expected: z.string(),
  operator: z.string(),
  message: z.string().default(''),
});
export type AssertionResult = z.infer<typeof AssertionResultSchema>;

// --- Step Result ---

export const StepResultSchema = z.object({
  stepId: z.string().uuid(),
  stepName: z.string(),
  iteration: z.number().int().min(0),
  status: z.number(), // HTTP status code
  statusText: z.string(),
  responseTime: z.number(), // ms
  responseSize: z.number(), // bytes
  responseHeaders: z.record(z.string(), z.string()),
  responseBody: z.string(),
  contentType: z.string(),
  extractedData: z.record(z.string(), z.unknown()).default({}),
  assertions: z.array(AssertionResultSchema).default([]),
  error: z.string().optional(), // populated if the request itself failed (network error, timeout)
  requestBody: z.string().optional(),
  // True when the bodies weren't kept: load runs only keep them for iteration 1 and failed steps.
  bodyOmitted: z.boolean().optional(),
  timestamp: z.string().datetime(),
  url: z.string().default(''),
  method: z.string().default('GET'),
});
export type StepResult = z.infer<typeof StepResultSchema>;

// --- Aggregate Metrics ---

export const AggregateMetricsSchema = z.object({
  totalRequests: z.number().int().min(0),
  completed: z.number().int().min(0),
  failed: z.number().int().min(0),
  avgLatency: z.number().min(0),
  minLatency: z.number().min(0),
  maxLatency: z.number().min(0),
  p50: z.number().min(0),
  p95: z.number().min(0),
  p99: z.number().min(0),
  throughputPerSec: z.number().min(0),
  errorRate: z.number().min(0).max(100),
  totalDataTransferred: z.number().int().min(0), // bytes
});
export type AggregateMetrics = z.infer<typeof AggregateMetricsSchema>;

// --- Execution Run ---

export const ExecutionStatusSchema = z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']);
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;

export const ExecutionRunSchema = z.object({
  id: z.string().uuid(),
  bucketId: z.string().uuid(),
  actionGroupId: z.string().uuid(),
  actionGroupName: z.string(),
  config: ExecutionConfigSchema,
  status: ExecutionStatusSchema.default('pending'),
  results: z.array(StepResultSchema).default([]),
  metrics: AggregateMetricsSchema.optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  duration: z.number().min(0).optional(), // total ms
  error: z.string().optional(), // why a run failed or stopped early
  environmentName: z.string().optional(), // the environment the run used, if any
  createdAt: z.string().datetime(),
});
export type ExecutionRun = z.infer<typeof ExecutionRunSchema>;

/** A run without its step results (what history lists and run:finished carry). */
export type RunSummary = Omit<ExecutionRun, 'results'>;

// --- Live run events (WebSocket) ---
// A client that subscribes gets a `run:snapshot` first, so nothing emitted before it subscribed is lost.

export type RunEvent =
  | { type: 'run:snapshot'; runId: string; run: ExecutionRun }
  | { type: 'run:started'; runId: string; totalSteps: number; totalIterations: number }
  | { type: 'step:started'; runId: string; stepId: string; stepName: string; iteration: number; method: string }
  | { type: 'step:finished'; runId: string; result: StepResult }
  | { type: 'run:finished'; runId: string; run: RunSummary };
