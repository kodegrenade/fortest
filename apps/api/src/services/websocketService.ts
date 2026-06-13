import { WebSocket } from 'ws';

// Map runId => Set of WebSocket client connections
const runSubscriptions = new Map<string, Set<WebSocket>>();

/**
 * Subscribes a WebSocket client to a specific execution run.
 */
export function subscribeToRun(runId: string, ws: WebSocket): void {
  if (!runSubscriptions.has(runId)) {
    runSubscriptions.set(runId, new Set());
  }
  runSubscriptions.get(runId)!.add(ws);
  console.log(`[WS] Client subscribed to run: ${runId} (total: ${runSubscriptions.get(runId)!.size})`);
}

/**
 * Unsubscribes a WebSocket client from an execution run.
 */
export function unsubscribeFromRun(runId: string, ws: WebSocket): void {
  const clients = runSubscriptions.get(runId);
  if (clients) {
    clients.delete(ws);
    if (clients.size === 0) {
      runSubscriptions.delete(runId);
    }
    console.log(`[WS] Client unsubscribed from run: ${runId}`);
  }
}

/**
 * Clears all subscriptions for a WebSocket client (called on disconnect).
 */
export function clearClientSubscriptions(ws: WebSocket): void {
  for (const [runId, clients] of runSubscriptions.entries()) {
    if (clients.has(ws)) {
      clients.delete(ws);
      if (clients.size === 0) {
        runSubscriptions.delete(runId);
      }
    }
  }
}

/**
 * Broadcasts an execution event to all clients subscribed to a runId.
 */
export function broadcastToRun(runId: string, event: any): void {
  const clients = runSubscriptions.get(runId);
  if (!clients) return;

  const payload = JSON.stringify(event);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(payload);
      } catch (err) {
        console.error(`[WS] Failed to send event to client in run ${runId}`, err);
      }
    }
  }
}
