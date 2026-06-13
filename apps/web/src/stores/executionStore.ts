import { create } from 'zustand';
import type { ExecutionRun, StepResult } from '@fortest/types';

interface ExecutionState {
  activeRun: ExecutionRun | null;
  isRunning: boolean;
  error: string | null;
  selectedStepId: string | null; // For displaying detail cards in the UI

  // Actions
  startRun: (bucketId: string, groupId: string) => Promise<string>;
  stopRun: () => void;
  selectStep: (stepId: string | null) => void;
  clearRun: () => void;
}

const getWsUrl = (): string => {
  const loc = window.location;
  // If in dev (Vite runs on 5173, backend on 3001)
  if (loc.port === '5173') {
    return 'ws://localhost:3001/ws';
  }
  const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${loc.host}/ws`;
};

let wsInstance: WebSocket | null = null;

export const useExecutionStore = create<ExecutionState>((set, get) => ({
  activeRun: null,
  isRunning: false,
  error: null,
  selectedStepId: null,

  selectStep: (stepId) => set({ selectedStepId: stepId }),

  clearRun: () => set({ activeRun: null, isRunning: false, error: null, selectedStepId: null }),

  startRun: async (bucketId, groupId) => {
    set({ isRunning: true, error: null, activeRun: null, selectedStepId: null });
    
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucketId, groupId }),
      });

      if (!res.ok) {
        throw new Error('Failed to initiate execution run');
      }

      const { runId } = await res.json();

      // Establish WebSocket connection
      if (wsInstance) {
        wsInstance.close();
      }

      const ws = new WebSocket(getWsUrl());
      wsInstance = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'subscribe', runId }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.runId !== runId) return;

          switch (message.type) {
            case 'run:started':
              set({
                activeRun: {
                  id: runId,
                  bucketId,
                  actionGroupId: groupId,
                  actionGroupName: '',
                  config: {
                    mode: 'manual',
                    iterations: 1,
                    concurrency: 1,
                    delayBetweenSteps: 0,
                    useDataStore: false,
                  },
                  status: 'running',
                  results: [],
                  createdAt: new Date().toISOString(),
                },
              });
              break;

            case 'step:started': {
              const currentRun = get().activeRun;
              if (currentRun) {
                // Pre-populate a loading step placeholder
                const tempResult: StepResult = {
                  stepId: message.stepId,
                  stepName: message.stepName,
                  iteration: 1,
                  status: 0,
                  statusText: 'Executing...', // Temp text
                  responseTime: 0,
                  responseSize: 0,
                  responseHeaders: {},
                  responseBody: '',
                  contentType: 'text/plain',
                  extractedData: {},
                  assertions: [],
                  timestamp: new Date().toISOString(),
                };

                set({
                  activeRun: {
                    ...currentRun,
                    results: [...currentRun.results.filter(r => r.stepId !== message.stepId), tempResult],
                  },
                });
                
                // Auto-select the first executing step if none is selected
                if (!get().selectedStepId) {
                  set({ selectedStepId: message.stepId });
                }
              }
              break;
            }

            case 'step:completed': {
              const currentRun = get().activeRun;
              if (currentRun) {
                const updatedResult: StepResult = {
                  stepId: message.stepId,
                  stepName: message.stepName,
                  iteration: 1,
                  status: message.statusCode,
                  statusText: String(message.statusCode),
                  responseTime: message.responseTime,
                  responseSize: 0, // Server-side computes actual size, but client doesn't need it for streaming overview
                  responseHeaders: {},
                  responseBody: '', // Handled by standard GET call or lazy loaded if needed, or fetched on demand
                  contentType: 'application/json',
                  extractedData: message.extractedData,
                  assertions: message.assertions,
                  timestamp: new Date().toISOString(),
                };

                set({
                  activeRun: {
                    ...currentRun,
                    results: currentRun.results.map((r) =>
                      r.stepId === message.stepId ? { ...r, ...updatedResult } : r
                    ),
                  },
                });
              }
              break;
            }

            case 'step:failed': {
              const currentRun = get().activeRun;
              if (currentRun) {
                const updatedResult: Partial<StepResult> = {
                  status: 0,
                  statusText: 'Failed',
                  error: message.error,
                  responseTime: message.responseTime || 0,
                  timestamp: new Date().toISOString(),
                };

                set({
                  activeRun: {
                    ...currentRun,
                    results: currentRun.results.map((r) =>
                      r.stepId === message.stepId ? { ...r, ...updatedResult } : r
                    ),
                  },
                });
              }
              break;
            }

            case 'run:completed': {
              const currentRun = get().activeRun;
              if (currentRun) {
                // Retrieve full completed run details via REST API
                fetch(`/api/runs/${runId}`)
                  .then((res) => res.json())
                  .then((fullRun: ExecutionRun) => {
                    set({
                      activeRun: fullRun,
                      isRunning: false,
                    });
                  })
                  .catch(() => {
                    set({
                      activeRun: {
                        ...currentRun,
                        status: 'completed',
                      },
                      isRunning: false,
                    });
                  });
              }
              break;
            }

            case 'run:failed': {
              const currentRun = get().activeRun;
              if (currentRun) {
                set({
                  activeRun: {
                    ...currentRun,
                    status: 'failed',
                  },
                  isRunning: false,
                  error: message.error,
                });
              }
              break;
            }
          }
        } catch (err) {
          console.error('Failed to parse WebSocket execution event', err);
        }
      };

      ws.onclose = () => {
        console.log('[WS] Connection closed');
      };

      ws.onerror = (err) => {
        console.error('[WS] Connection error', err);
        set({ error: 'Connection to streaming execution server lost.' });
      };

      return runId;
    } catch (err: any) {
      set({ isRunning: false, error: err.message || 'Failed to start run' });
      throw err;
    }
  },

  stopRun: () => {
    if (wsInstance) {
      wsInstance.close();
      wsInstance = null;
    }
    set({ isRunning: false });
  },
}));
