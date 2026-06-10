import { createClient, type RedisClientType } from 'redis';

let client: RedisClientType | null = null;
let connected = false;

export async function connectRedis(): Promise<boolean> {
  const url = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

  try {
    client = createClient({ url });

    client.on('error', (err: Error) => {
      console.error('[Redis] Connection error:', err.message);
      connected = false;
    });

    client.on('reconnecting', () => {
      console.log('[Redis] Reconnecting...');
    });

    await client.connect();
    connected = true;
    console.log('[Redis] Connected successfully');
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[Redis] Failed to connect: ${message}`);
    console.warn('[Redis] Falling back to in-memory storage');
    client = null;
    connected = false;
    return false;
  }
}

export function getRedisClient(): RedisClientType | null {
  return connected ? client : null;
}

export function isRedisAvailable(): boolean {
  return connected && client !== null;
}

export async function disconnectRedis(): Promise<void> {
  if (client && connected) {
    try {
      await client.quit();
      console.log('[Redis] Disconnected');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[Redis] Error during disconnect: ${message}`);
    } finally {
      client = null;
      connected = false;
    }
  }
}
