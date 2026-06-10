import { z } from 'zod';

// --- Environment Variable ---

export const VariableTypeSchema = z.enum(['text', 'secret']);
export type VariableType = z.infer<typeof VariableTypeSchema>;

export const EnvironmentVariableSchema = z.object({
  id: z.string().uuid(),
  key: z.string().min(1),
  value: z.string(),
  type: VariableTypeSchema.default('text'),
  enabled: z.boolean().default(true),
});
export type EnvironmentVariable = z.infer<typeof EnvironmentVariableSchema>;

// --- Environment ---

export const EnvironmentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  variables: z.array(EnvironmentVariableSchema).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Environment = z.infer<typeof EnvironmentSchema>;
