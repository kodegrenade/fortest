import { z } from 'zod';
import { AuthConfigSchema, ForTestRequestSchema } from './request';

// --- Folder (recursive) ---

export interface Folder {
  id: string;
  name: string;
  description?: string;
  folders: Folder[];
  requests: z.infer<typeof ForTestRequestSchema>[];
  auth?: z.infer<typeof AuthConfigSchema>;
}

// Input type allows omitting defaulted fields
interface FolderInput {
  id: string;
  name: string;
  description?: string;
  folders?: FolderInput[];
  requests?: z.input<typeof ForTestRequestSchema>[];
  auth?: z.input<typeof AuthConfigSchema>;
}

// Zod schema for recursive folder structure
export const FolderSchema: z.ZodType<Folder, z.ZodTypeDef, FolderInput> = z.lazy(() =>
  z.object({
    id: z.string().uuid(),
    name: z.string().min(1),
    description: z.string().optional(),
    folders: z.array(FolderSchema).default([]),
    requests: z.array(ForTestRequestSchema).default([]),
    auth: AuthConfigSchema.optional(),
  }),
);

// --- Collection ---

export const CollectionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().optional(),
  folders: z.array(FolderSchema).default([]),
  requests: z.array(ForTestRequestSchema).default([]),
  auth: AuthConfigSchema.optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.number().int().default(1),
});
export type Collection = z.infer<typeof CollectionSchema>;
