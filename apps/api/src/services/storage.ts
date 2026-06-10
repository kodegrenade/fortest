import type { StorageMode } from '@fortest/types';
import { getRedisClient, isRedisAvailable } from './redis';

// --- Storage Adapter Interface ---

export interface StorageAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
  keys(pattern: string): Promise<string[]>;
  sadd(key: string, member: string): Promise<void>;
  smembers(key: string): Promise<string[]>;
  srem(key: string, member: string): Promise<void>;
  zadd(key: string, score: number, member: string): Promise<void>;
  zrevrange(key: string, start: number, stop: number): Promise<string[]>;
  zrem(key: string, member: string): Promise<void>;
  zcard(key: string): Promise<number>;
  zremrangebyrank(key: string, start: number, stop: number): Promise<void>;
}

// --- Redis Implementation ---

export class RedisStorageAdapter implements StorageAdapter {
  async get(key: string): Promise<string | null> {
    const client = getRedisClient();
    if (!client) throw new Error('Redis client unavailable');
    return client.get(key);
  }

  async set(key: string, value: string): Promise<void> {
    const client = getRedisClient();
    if (!client) throw new Error('Redis client unavailable');
    await client.set(key, value);
  }

  async del(key: string): Promise<void> {
    const client = getRedisClient();
    if (!client) throw new Error('Redis client unavailable');
    await client.del(key);
  }

  async keys(pattern: string): Promise<string[]> {
    const client = getRedisClient();
    if (!client) throw new Error('Redis client unavailable');
    return client.keys(pattern);
  }

  async sadd(key: string, member: string): Promise<void> {
    const client = getRedisClient();
    if (!client) throw new Error('Redis client unavailable');
    await client.sAdd(key, member);
  }

  async smembers(key: string): Promise<string[]> {
    const client = getRedisClient();
    if (!client) throw new Error('Redis client unavailable');
    return client.sMembers(key);
  }

  async srem(key: string, member: string): Promise<void> {
    const client = getRedisClient();
    if (!client) throw new Error('Redis client unavailable');
    await client.sRem(key, member);
  }

  async zadd(key: string, score: number, member: string): Promise<void> {
    const client = getRedisClient();
    if (!client) throw new Error('Redis client unavailable');
    await client.zAdd(key, [{ score, value: member }]);
  }

  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    const client = getRedisClient();
    if (!client) throw new Error('Redis client unavailable');
    return client.zRange(key, start, stop, { REV: true });
  }

  async zrem(key: string, member: string): Promise<void> {
    const client = getRedisClient();
    if (!client) throw new Error('Redis client unavailable');
    await client.zRem(key, member);
  }

  async zcard(key: string): Promise<number> {
    const client = getRedisClient();
    if (!client) throw new Error('Redis client unavailable');
    return client.zCard(key);
  }

  async zremrangebyrank(key: string, start: number, stop: number): Promise<void> {
    const client = getRedisClient();
    if (!client) throw new Error('Redis client unavailable');
    await client.zRemRangeByRank(key, start, stop);
  }
}

// --- In-Memory Implementation ---

interface SortedSetEntry {
  score: number;
  member: string;
}

export class MemoryStorageAdapter implements StorageAdapter {
  private store = new Map<string, string>();
  private sets = new Map<string, Set<string>>();
  private sortedSets = new Map<string, SortedSetEntry[]>();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
    this.sets.delete(key);
    this.sortedSets.delete(key);
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp(
      '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$',
    );
    const allKeys = [
      ...this.store.keys(),
      ...this.sets.keys(),
      ...this.sortedSets.keys(),
    ];
    // Deduplicate keys that may exist in multiple maps
    return [...new Set(allKeys)].filter((k) => regex.test(k));
  }

  async sadd(key: string, member: string): Promise<void> {
    let set = this.sets.get(key);
    if (!set) {
      set = new Set();
      this.sets.set(key, set);
    }
    set.add(member);
  }

  async smembers(key: string): Promise<string[]> {
    const set = this.sets.get(key);
    return set ? [...set] : [];
  }

  async srem(key: string, member: string): Promise<void> {
    this.sets.get(key)?.delete(member);
  }

  async zadd(key: string, score: number, member: string): Promise<void> {
    let entries = this.sortedSets.get(key);
    if (!entries) {
      entries = [];
      this.sortedSets.set(key, entries);
    }
    // Update existing or add new
    const idx = entries.findIndex((e) => e.member === member);
    if (idx !== -1) {
      entries[idx] = { score, member };
    } else {
      entries.push({ score, member });
    }
    // Keep sorted by score ascending (Redis default)
    entries.sort((a, b) => a.score - b.score);
  }

  async zrevrange(key: string, start: number, stop: number): Promise<string[]> {
    const entries = this.sortedSets.get(key);
    if (!entries) return [];
    // Reverse order (highest score first), then slice
    const reversed = [...entries].reverse();
    const end = stop === -1 ? reversed.length : stop + 1;
    return reversed.slice(start, end).map((e) => e.member);
  }

  async zrem(key: string, member: string): Promise<void> {
    const entries = this.sortedSets.get(key);
    if (!entries) return;
    const idx = entries.findIndex((e) => e.member === member);
    if (idx !== -1) entries.splice(idx, 1);
  }

  async zcard(key: string): Promise<number> {
    return this.sortedSets.get(key)?.length ?? 0;
  }

  async zremrangebyrank(key: string, start: number, stop: number): Promise<void> {
    const entries = this.sortedSets.get(key);
    if (!entries) return;
    const end = stop === -1 ? entries.length : stop + 1;
    entries.splice(start, end - start);
  }
}

// --- Factory & Mode ---

let activeAdapter: StorageAdapter | null = null;
let storageMode: StorageMode = 'memory';

export function createStorageAdapter(): StorageAdapter {
  if (isRedisAvailable()) {
    storageMode = 'redis';
    activeAdapter = new RedisStorageAdapter();
    console.log('[Storage] Using Redis adapter');
  } else {
    storageMode = 'memory';
    activeAdapter = new MemoryStorageAdapter();
    console.log('[Storage] Using in-memory adapter');
  }
  return activeAdapter;
}

export function getStorageAdapter(): StorageAdapter {
  if (!activeAdapter) {
    return createStorageAdapter();
  }
  return activeAdapter;
}

export function getStorageMode(): StorageMode {
  return storageMode;
}
