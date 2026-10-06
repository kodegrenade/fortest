import { WebSocketServer } from 'ws';
import app from './app';
import { connectRedis, disconnectRedis } from './services/redis';
import { createStorageAdapter, getStorageMode } from './services/storage';
import { subscribeToRun, unsubscribeFromRun, clearClientSubscriptions } from './services/websocketService';
import { getRunById, failOrphanedRuns } from './services/runnerService';
import type { RunEvent } from '@fortest/types';
import { isLocalRequest } from './middleware/security';

const PORT = parseInt(process.env['PORT'] ?? '3001', 10);
// Loopback only by default; Docker sets HOST=0.0.0.0 and publishes the port on 127.0.0.1 instead.
const HOST = process.env['HOST'] ?? '127.0.0.1';

async function start(): Promise<void> {
  // Attempt Redis connection (non-fatal if it fails)
  await connectRedis();

  // Initialize storage adapter based on Redis availability
  createStorageAdapter();
  console.log(`[Server] Storage mode: ${getStorageMode()}`);
  await failOrphanedRuns();

  const server = app.listen(PORT, HOST, () => {
    console.log(`[Server] Fortest API running on http://${HOST}:${PORT}`);
    console.log(`[Server] Health check: http://localhost:${PORT}/api/health`);
  });

  // Attach WebSocket Server
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '', 'http://localhost');
    if (url.pathname === '/ws' && isLocalRequest(request.headers)) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws) => {
    console.log('[WS] Client connected');

    ws.on('message', (message: string) => {
      try {
        const parsed = JSON.parse(message);
        if (parsed.type === 'subscribe') {
          subscribeToRun(parsed.runId, ws);
          // Snapshot of everything so far, so events emitted before this subscription aren't lost.
          getRunById(parsed.runId)
            .then((run) => {
              if (!run) return;
              const snapshot: RunEvent = { type: 'run:snapshot', runId: run.id, run };
              ws.send(JSON.stringify(snapshot));
            })
            .catch((err) => console.error('[WS] Error sending run snapshot:', err));
        } else if (parsed.type === 'unsubscribe') {
          unsubscribeFromRun(parsed.runId, ws);
        }
      } catch (err) {
        console.error('[WS] Failed to parse client message', err);
      }
    });

    ws.on('close', () => {
      console.log('[WS] Client disconnected');
      clearClientSubscriptions(ws);
    });
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n[Server] Received ${signal}, shutting down gracefully...`);

    // Close WebSocket clients
    wss.close(() => {
      console.log('[Server] WebSocket server closed');
    });

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
