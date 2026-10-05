import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { TestBucketSchema, type TestBucket } from '@fortest/types';
import { getStorageAdapter } from './storage';

const INDEX_KEY = 'buckets:index';

function getBucketKey(id: string): string {
  return `bucket:${id}`;
}

export async function getAllBuckets(): Promise<TestBucket[]> {
  const adapter = getStorageAdapter();
  const ids = await adapter.smembers(INDEX_KEY);

  const buckets: TestBucket[] = [];
  for (const id of ids) {
    const data = await adapter.get(getBucketKey(id));
    if (data) {
      try {
        const parsed: unknown = JSON.parse(data);
        buckets.push(parsed as TestBucket);
      } catch (err) {
        console.error(`Failed to parse bucket ${id}`, err);
      }
    }
  }

  return buckets.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getBucketById(id: string): Promise<TestBucket | null> {
  const adapter = getStorageAdapter();
  const data = await adapter.get(getBucketKey(id));
  if (!data) return null;

  try {
    return JSON.parse(data) as TestBucket;
  } catch (err) {
    console.error(`Failed to parse bucket ${id}`, err);
    return null;
  }
}

export async function createBucket(name: string, baseUrl?: string): Promise<TestBucket> {
  const adapter = getStorageAdapter();
  const id = randomUUID();
  const now = new Date().toISOString();

  const newBucket: TestBucket = {
    id,
    name,
    baseUrl: baseUrl ?? '',
    auth: { type: 'none' },
    variables: [],
    actionGroups: [],
    createdAt: now,
    updatedAt: now,
  };

  // Validate before save
  TestBucketSchema.parse(newBucket);

  await adapter.set(getBucketKey(id), JSON.stringify(newBucket));
  await adapter.sadd(INDEX_KEY, id);

  return newBucket;
}

export async function updateBucket(id: string, updates: Partial<TestBucket>): Promise<TestBucket | null> {
  const adapter = getStorageAdapter();
  const existingData = await adapter.get(getBucketKey(id));
  if (!existingData) return null;

  const existing = JSON.parse(existingData) as TestBucket;
  // Store the parsed result, not the raw merge: parsing strips unknown keys and fills defaults.
  const updated = TestBucketSchema.parse({
    ...existing,
    ...updates,
    id, // protect id
    createdAt: existing.createdAt, // protect createdAt
    updatedAt: new Date().toISOString(),
  });

  await adapter.set(getBucketKey(id), JSON.stringify(updated));
  return updated;
}

export async function deleteBucket(id: string): Promise<boolean> {
  const adapter = getStorageAdapter();
  const existingData = await adapter.get(getBucketKey(id));
  if (!existingData) return false;

  await adapter.del(getBucketKey(id));
  await adapter.srem(INDEX_KEY, id);
  return true;
}

export async function saveBucket(bucket: TestBucket): Promise<void> {
  const adapter = getStorageAdapter();
  await adapter.set(getBucketKey(bucket.id), JSON.stringify(bucket));
  await adapter.sadd(INDEX_KEY, bucket.id);
}

const ImportedBucketShape = z
  .record(z.string(), z.any())
  .refine((o) => ['name', 'baseUrl', 'variables', 'actionGroups'].some((key) => key in o), {
    message: 'Not a Fortest bucket file: expected name, baseUrl, variables or actionGroups',
  });

/**
 * Turns an imported bucket file into a valid bucket: fresh ids everywhere (so re-importing never
 * collides), timestamps and names/orders filled in, everything else defaulted by the schema.
 * Throws a ZodError (-> 400) on unknown top-level keys or invalid content.
 */
export function prepareImport(input: unknown): TestBucket {
  const raw = ImportedBucketShape.parse(input);
  const now = new Date().toISOString();
  const list = (value: unknown): any[] => (Array.isArray(value) ? value : []);
  const fresh = (o: any) => ({ ...o, id: randomUUID(), createdAt: o?.createdAt ?? now, updatedAt: now });
  const withIds = (value: unknown) => list(value).map((o) => ({ ...o, id: randomUUID() }));

  return TestBucketSchema.strict().parse({
    name: 'Imported Bucket',
    ...fresh(raw),
    variables: withIds(raw.variables),
    actionGroups: list(raw.actionGroups).map((group, gIdx) => ({
      name: `Action Group ${gIdx + 1}`,
      order: gIdx,
      ...fresh(group),
      dataStore: group.dataStore && { name: 'Data Store', ...fresh(group.dataStore) },
      steps: list(group.steps).map((step, sIdx) => ({
        name: `Step ${sIdx + 1}`,
        order: sIdx,
        ...fresh(step),
        headers: withIds(step.headers),
        params: withIds(step.params),
        extractions: withIds(step.extractions),
        assertions: withIds(step.assertions),
      })),
    })),
  });
}
