import { createClient, type RedisClientType } from 'redis';

let client: RedisClientType | null = null;

export async function connectRedis(): Promise<boolean> {
  const url = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
  let wasReady = false;

  client = createClient({
    url,
    socket: {
      // Before the first successful connect: a few quick retries, then give up so the server
      // starts on in-memory storage. After that: keep reconnecting through Redis blips.
      reconnectStrategy: (retries) =>
        wasReady
          ? Math.min(retries * 200, 5000)
          : retries < 3
            ? 500
            : new Error('Redis unreachable'),
    },
  });

  client.on('error', (err: Error) => {
    console.error('[Redis] Connection error:', err.message);
  });

  client.on('reconnecting', () => {
    console.log('[Redis] Reconnecting...');
  });

  client.on('ready', () => {
    wasReady = true;
  });

  try {
    await client.connect();
    console.log('[Redis] Connected successfully');
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[Redis] Failed to connect: ${message}`);
    console.warn('[Redis] Falling back to in-memory storage');
    client = null;
    return false;
  }
}

// Null while disconnected, so storage calls fail fast instead of queueing until Redis returns.
export function getRedisClient(): RedisClientType | null {
  return client?.isReady ? client : null;
}

export function isRedisAvailable(): boolean {
  return getRedisClient() !== null;
}

export async function disconnectRedis(): Promise<void> {
  if (!client?.isOpen) return;
  try {
    await client.quit();
    console.log('[Redis] Disconnected');
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Redis] Error during disconnect: ${message}`);
  } finally {
    client = null;
  }
}
