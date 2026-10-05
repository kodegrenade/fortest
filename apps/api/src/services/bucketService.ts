import { v4 as uuidv4 } from 'uuid';
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
  const id = uuidv4();
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

