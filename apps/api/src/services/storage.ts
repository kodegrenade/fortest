import type { StorageMode } from '@fortest/types';
import { getRedisClient, isRedisAvailable } from './redis';

// --- Storage Adapter Interface ---
// The Redis commands Fortest uses, with an in-memory stand-in for running without Redis.

export interface StorageAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
  sadd(key: string, member: string): Promise<void>;
  smembers(key: string): Promise<string[]>;
  srem(key: string, member: string): Promise<void>;
  zadd(key: string, score: number, member: string): Promise<void>;
  zrevrange(key: string, start: number, stop: number): Promise<string[]>;
  zcard(key: string): Promise<number>;
  zremrangebyrank(key: string, start: number, stop: number): Promise<void>;
  rpush(key: string, value: string): Promise<void>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
}

// --- Redis Implementation ---

function redis() {
  const client = getRedisClient();
  if (!client) throw new Error('Redis client unavailable');
  return client;
}

class RedisStorageAdapter implements StorageAdapter {
  get = (key: string) => redis().get(key);
  set = async (key: string, value: string) => void (await redis().set(key, value));
  del = async (key: string) => void (await redis().del(key));
  sadd = async (key: string, member: string) => void (await redis().sAdd(key, member));
  smembers = (key: string) => redis().sMembers(key);
  srem = async (key: string, member: string) => void (await redis().sRem(key, member));
  zadd = async (key: string, score: number, member: string) =>
    void (await redis().zAdd(key, [{ score, value: member }]));
  zrevrange = (key: string, start: number, stop: number) =>
    redis().zRange(key, start, stop, { REV: true });
  zcard = (key: string) => redis().zCard(key);
  zremrangebyrank = async (key: string, start: number, stop: number) =>
    void (await redis().zRemRangeByRank(key, start, stop));
  rpush = async (key: string, value: string) => void (await redis().rPush(key, value));
  lrange = (key: string, start: number, stop: number) => redis().lRange(key, start, stop);
}

// --- In-Memory Implementation ---

class MemoryStorageAdapter implements StorageAdapter {
  private store = new Map<string, string>();
  private sets = new Map<string, Set<string>>();
  private sortedSets = new Map<string, Map<string, number>>(); // member -> score
  private lists = new Map<string, string[]>();

  // Members ordered by ascending score, like Redis.
  private ranked(key: string): string[] {
    return [...(this.sortedSets.get(key) ?? [])]
      .sort((a, b) => a[1] - b[1])
      .map(([member]) => member);
  }

  async get(key: string) {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string) {
    this.store.set(key, value);
  }

  async del(key: string) {
    this.store.delete(key);
    this.sets.delete(key);
    this.sortedSets.delete(key);
    this.lists.delete(key);
  }

  async sadd(key: string, member: string) {
    this.sets.set(key, (this.sets.get(key) ?? new Set()).add(member));
  }

  async smembers(key: string) {
    return [...(this.sets.get(key) ?? [])];
  }

  async srem(key: string, member: string) {
    this.sets.get(key)?.delete(member);
  }

  async zadd(key: string, score: number, member: string) {
    this.sortedSets.set(key, (this.sortedSets.get(key) ?? new Map()).set(member, score));
  }

  async zrevrange(key: string, start: number, stop: number) {
    return this.ranked(key)
      .reverse()
      .slice(start, stop === -1 ? undefined : stop + 1);
  }

  async zcard(key: string) {
    return this.sortedSets.get(key)?.size ?? 0;
  }

  async zremrangebyrank(key: string, start: number, stop: number) {
    const set = this.sortedSets.get(key);
    for (const member of this.ranked(key).slice(start, stop === -1 ? undefined : stop + 1))
      set?.delete(member);
  }

  async rpush(key: string, value: string) {
    const list = this.lists.get(key) ?? [];
    list.push(value);
    this.lists.set(key, list);
  }

  async lrange(key: string, start: number, stop: number) {
    return (this.lists.get(key) ?? []).slice(start, stop === -1 ? undefined : stop + 1);
  }
}

// --- Factory & Mode ---

let activeAdapter: StorageAdapter | null = null;

export function createStorageAdapter(): StorageAdapter {
  activeAdapter = isRedisAvailable() ? new RedisStorageAdapter() : new MemoryStorageAdapter();
  console.log(`[Storage] Using ${getStorageMode()} adapter`);
  return activeAdapter;
}

export function getStorageAdapter(): StorageAdapter {
  return activeAdapter ?? createStorageAdapter();
}

export function getStorageMode(): StorageMode {
  return activeAdapter instanceof RedisStorageAdapter ? 'redis' : 'memory';
}
