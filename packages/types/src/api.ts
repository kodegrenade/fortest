import { z } from 'zod';
import { HttpMethodSchema } from './request';

// --- Proxy Request (what the frontend sends to the backend) ---

export const ProxyRequestSchema = z.object({
  method: HttpMethodSchema,
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).default({}),
  body: z.string().optional(),
  timeout: z.number().int().positive().max(120000).default(30000),
});
export type ProxyRequest = z.infer<typeof ProxyRequestSchema>;

// --- Proxy Response (what the backend returns to the frontend) ---

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
