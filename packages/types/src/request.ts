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
