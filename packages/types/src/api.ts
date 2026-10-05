import { z } from 'zod';

// --- HTTP Response (as captured by the runner for each step) ---

export const ProxyResponseSchema = z.object({
  status: z.number(),
  statusText: z.string(),
  headers: z.record(z.string(), z.string()),
  body: z.string(),
  size: z.number(),
  time: z.number(),
  contentType: z.string(),
});
export type ProxyResponse = z.infer<typeof ProxyResponseSchema>;

// --- Storage Mode ---

export const StorageModeSchema = z.enum(['redis', 'memory']);
export type StorageMode = z.infer<typeof StorageModeSchema>;

// --- API Error Response ---

export const ApiErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
  statusCode: z.number(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

// --- Health Check ---

export const HealthCheckSchema = z.object({
  status: z.enum(['healthy', 'degraded']),
  storageMode: StorageModeSchema,
  uptime: z.number(),
  timestamp: z.string().datetime(),
});
export type HealthCheck = z.infer<typeof HealthCheckSchema>;
