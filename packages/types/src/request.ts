import { z } from 'zod';

// --- HTTP Methods ---

export const HttpMethodSchema = z.enum([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
]);
export type HttpMethod = z.infer<typeof HttpMethodSchema>;

// --- Key-Value Pairs (headers, params, form data) ---

export const KeyValuePairSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  value: z.string(),
  enabled: z.boolean().default(true),
  description: z.string().optional(),
});
export type KeyValuePair = z.infer<typeof KeyValuePairSchema>;

// --- Request Body ---

export const BodyTypeSchema = z.enum([
  'none',
  'json',
  'xml',
  'form-data',
  'x-www-form-urlencoded',
  'raw',
]);
export type BodyType = z.infer<typeof BodyTypeSchema>;

export const RequestBodySchema = z.object({
  type: BodyTypeSchema.default('none'),
  content: z.string().default(''),
});
export type RequestBody = z.infer<typeof RequestBodySchema>;

// --- Auth Config ---

export const AuthTypeSchema = z.enum(['none', 'bearer', 'basic', 'api-key']);
export type AuthType = z.infer<typeof AuthTypeSchema>;

export const AuthConfigSchema = z.object({
  type: AuthTypeSchema.default('none'),
  bearer: z.object({ token: z.string() }).optional(),
  basic: z.object({ username: z.string(), password: z.string() }).optional(),
  apiKey: z
    .object({
      key: z.string(),
      value: z.string(),
      addTo: z.enum(['header', 'query']).default('header'),
    })
    .optional(),
});
export type AuthConfig = z.infer<typeof AuthConfigSchema>;

// --- Request ---

export const ForTestRequestSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  method: HttpMethodSchema.default('GET'),
  url: z.string(),
  headers: z.array(KeyValuePairSchema).default([]),
  params: z.array(KeyValuePairSchema).default([]),
  body: RequestBodySchema.default({ type: 'none', content: '' }),
  auth: AuthConfigSchema.default({ type: 'none' }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ForTestRequest = z.infer<typeof ForTestRequestSchema>;

// --- Response ---

export const ForTestResponseSchema = z.object({
  status: z.number(),
  statusText: z.string(),
  headers: z.record(z.string(), z.string()),
  body: z.string(),
  size: z.number(),
  time: z.number(),
  contentType: z.string(),
});
export type ForTestResponse = z.infer<typeof ForTestResponseSchema>;
