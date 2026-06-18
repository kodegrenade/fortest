import { z } from 'zod';
import { HttpMethodSchema, KeyValuePairSchema, RequestBodySchema, AuthConfigSchema } from './request';

// --- Extraction Rule ---
// Pulls a value from a step's response into the run context.
// Example: { variableName: 'authToken', source: 'body', selector: 'data.token' }

export const ExtractionSourceSchema = z.enum(['body', 'header', 'status']);
export type ExtractionSource = z.infer<typeof ExtractionSourceSchema>;

export const ExtractionRuleSchema = z.object({
  id: z.string().uuid(),
  variableName: z.string().min(1),
  source: ExtractionSourceSchema.default('body'),
  selector: z.string().min(1), // dot notation path, e.g. "data.user.id"
});
export type ExtractionRule = z.infer<typeof ExtractionRuleSchema>;

// --- Assertion ---
// Validates a step's response against an expected value.

export const AssertionOperatorSchema = z.enum([
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'greater_than',
  'less_than',
  'exists',
  'not_exists',
  'matches_regex',
]);
export type AssertionOperator = z.infer<typeof AssertionOperatorSchema>;

export const AssertionTargetSchema = z.enum(['status', 'body', 'header', 'response_time']);
export type AssertionTarget = z.infer<typeof AssertionTargetSchema>;

export const AssertionSchema = z.object({
  id: z.string().uuid(),
  target: AssertionTargetSchema,
  selector: z.string().default(''), // dot notation for body/header, empty for status/response_time
  operator: AssertionOperatorSchema,
  expected: z.string(),
});
export type Assertion = z.infer<typeof AssertionSchema>;

// --- Step ---
// A single API request within an action group.

export const StepSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  order: z.number().int().min(0),
  method: HttpMethodSchema.default('GET'),
  path: z.string().default('/'), // relative to bucket baseUrl
  headers: z.array(KeyValuePairSchema).default([]),
  params: z.array(KeyValuePairSchema).default([]),
  body: RequestBodySchema.default({ type: 'none', content: '' }),
  auth: AuthConfigSchema.default({ type: 'none' }), // step-level auth override (falls back to bucket auth if 'none')
  extractions: z.array(ExtractionRuleSchema).default([]),
  assertions: z.array(AssertionSchema).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Step = z.infer<typeof StepSchema>;

// --- Data Store ---
// An uploaded JSON array attached to an action group for parameterized concurrent runs.

export const DataStoreSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  records: z.array(z.record(z.string(), z.unknown())).default([]),
  createdAt: z.string().datetime(),
});
export type DataStore = z.infer<typeof DataStoreSchema>;

// --- Action Group ---
// An ordered sequence of steps forming a logical test flow.

export const ActionGroupSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().default(''),
  order: z.number().int().min(0),
  steps: z.array(StepSchema).default([]),
  dataStore: DataStoreSchema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).refine(
  (data) => {
    const names = data.steps.map((s) => s.name.trim().toLowerCase());
    return names.length === new Set(names).size;
  },
  {
    message: 'Duplicate step names are not allowed within the same action group',
    path: ['steps'],
  }
);
export type ActionGroup = z.infer<typeof ActionGroupSchema>;

// --- Bucket Variable ---

export const BucketVariableSchema = z.object({
  id: z.string().uuid(),
  key: z.string().min(1),
  value: z.string(),
  enabled: z.boolean().default(true),
});
export type BucketVariable = z.infer<typeof BucketVariableSchema>;

// --- Test Bucket ---
// Top-level container scoped to one API service.

export const TestBucketSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  baseUrl: z.string().default(''),
  auth: AuthConfigSchema.default({ type: 'none' }),
  variables: z.array(BucketVariableSchema).default([]),
  actionGroups: z.array(ActionGroupSchema).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type TestBucket = z.infer<typeof TestBucketSchema>;
