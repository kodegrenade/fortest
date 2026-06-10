import app from './app';
import { connectRedis, disconnectRedis } from './services/redis';
import { createStorageAdapter, getStorageMode } from './services/storage';

const PORT = parseInt(process.env['PORT'] ?? '3001', 10);

async function start(): Promise<void> {
  // Attempt Redis connection (non-fatal if it fails)
  await connectRedis();

  // Initialize storage adapter based on Redis availability
  createStorageAdapter();
  console.log(`[Server] Storage mode: ${getStorageMode()}`);

  const server = app.listen(PORT, () => {
    console.log(`[Server] Fortest API running on http://localhost:${PORT}`);
    console.log(`[Server] Health check: http://localhost:${PORT}/api/health`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n[Server] Received ${signal}, shutting down gracefully...`);

    server.close(() => {
      console.log('[Server] HTTP server closed');
    });

    await disconnectRedis();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

start().catch((err) => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});
