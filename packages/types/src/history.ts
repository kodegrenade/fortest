import { z } from 'zod';
import { ForTestRequestSchema, ForTestResponseSchema } from './request';

// --- History Entry ---

export const HistoryEntrySchema = z.object({
  id: z.string().uuid(),
  request: ForTestRequestSchema,
  response: ForTestResponseSchema,
  environment: z.string().optional(),
  timestamp: z.string().datetime(),
});
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;
