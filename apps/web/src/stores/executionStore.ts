import { create } from 'zustand';
import type { ExecutionRun, StepResult, ExecutionConfig } from '@fortest/types';
import { useToastStore } from './toastStore';

export interface BackgroundJob {
  runId: string;
  bucketId: string;
  actionGroupId: string;
  actionGroupName: string;
  status: 'running' | 'completed' | 'failed';
  progress: number;
  totalSteps: number;
  completedSteps: number;
  createdAt: string;
}

interface ExecutionState {
  activeRun: ExecutionRun | null;
  isRunning: boolean;
  error: string | null;
  selectedStepId: string | null; // For displaying detail cards in the UI
  selectedIteration: number | null; // For mapping details to correct iteration
  pastRuns: ExecutionRun[];
  pastRunsLoading: boolean;
  backgroundJobs: BackgroundJob[];

  // Actions
  initializeGlobalSocket: () => void;
  startRun: (bucketId: string, groupId: string, config?: ExecutionConfig, actionGroupName?: string) => Promise<string>;
  stopRun: () => void;
  selectStep: (stepId: string | null, iteration?: number | null) => void;
  clearRun: () => void;
  loadRuns: (groupId: string) => Promise<void>;
  viewHistoricalRun: (runId: string) => Promise<void>;
  removeBackgroundJob: (runId: string) => void;
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

function showNativeNotification(title: string, body: string) {
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: '/favicon.png',
      });
    } catch (err) {
      console.error('Failed to display native push notification:', err);
    }
  }
}

export const useExecutionStore = create<ExecutionState>((set, get) => ({
  activeRun: null,
  isRunning: false,
  error: null,
  selectedStepId: null,
  selectedIteration: null,
  pastRuns: [],
  pastRunsLoading: false,
  backgroundJobs: [],

  selectStep: (stepId, iteration = 1) => set({ selectedStepId: stepId, selectedIteration: iteration }),

  removeBackgroundJob: (runId) => {
    set((state) => ({
      backgroundJobs: state.backgroundJobs.filter((j) => j.runId !== runId),
    }));
  },

  clearRun: () => {
    set({ activeRun: null, isRunning: false, error: null, selectedStepId: null, selectedIteration: null });
  },

  loadRuns: async (groupId) => {
    set({ pastRunsLoading: true });
    try {
      const res = await fetch(`/api/runs?groupId=${groupId}`);
      if (!res.ok) throw new Error('Failed to load past runs');
      const data = await res.json();
      set({ pastRuns: data, pastRunsLoading: false });
    } catch (err: any) {
      console.error(err);
      set({ pastRunsLoading: false });
    }
  },

  viewHistoricalRun: async (runId) => {
    set({ isRunning: false, error: null, selectedStepId: null, selectedIteration: null });
    try {
      const res = await fetch(`/api/runs/${runId}`);
      if (!res.ok) throw new Error('Failed to load historical run details');
      const run = await res.json();
      set({ activeRun: run });
    } catch (err: any) {
      console.error(err);
      set({ error: err.message || 'Failed to inspect run' });
    }
  },

  initializeGlobalSocket: () => {
    if (wsInstance && (wsInstance.readyState === WebSocket.CONNECTING || wsInstance.readyState === WebSocket.OPEN)) {
      return;
    }

    const connect = () => {
      const ws = new WebSocket(getWsUrl());
      wsInstance = ws;

      ws.onopen = () => {
        console.log('[WS] Global socket connected');
        // Resubscribe to any active running background jobs
        const runningJobs = get().backgroundJobs.filter((j) => j.status === 'running');
        for (const job of runningJobs) {
          ws.send(JSON.stringify({ type: 'subscribe', runId: job.runId }));
        }
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          const { runId, type } = message;
          if (!runId) return;

          const isInspecting = get().activeRun?.id === runId;

          // Update background job state
          set((state) => {
            const updatedJobs = state.backgroundJobs.map((job) => {
              if (job.runId !== runId) return job;

              let status = job.status;
              let completedSteps = job.completedSteps;
              let progress = job.progress;
              let totalSteps = job.totalSteps;

              if (type === 'run:started') {
                const stepsCount = message.totalSteps || 1;
                const itersCount = message.totalIterations || 1;
                totalSteps = stepsCount * itersCount;
              } else if (type === 'step:completed' || type === 'step:failed') {
                completedSteps = job.completedSteps + 1;
                const total = totalSteps || 1;
                progress = Math.min(Math.round((completedSteps / total) * 100), 99);
              } else if (type === 'run:completed') {
                const failedCount = message.summary?.failed || 0;
                status = failedCount > 0 ? 'failed' : 'completed';
                progress = 100;
                if (failedCount > 0) {
                  showNativeNotification(
                    'Execution Failed',
                    `Action Group "${job.actionGroupName}" completed with ${failedCount} failure(s).`
                  );
                  useToastStore.getState().addToast(
                    `Action Group "${job.actionGroupName}" completed with ${failedCount} failure(s).`,
                    'error'
                  );
                } else {
                  showNativeNotification(
                    'Execution Completed',
                    `Action Group "${job.actionGroupName}" completed successfully.`
                  );
                  useToastStore.getState().addToast(
                    `Action Group "${job.actionGroupName}" completed successfully.`,
                    'success'
                  );
                }
              } else if (type === 'run:failed') {
                status = 'failed';
                const errMsg = message.error || 'Unknown error';
                showNativeNotification(
                  'Execution Failed',
                  `Action Group "${job.actionGroupName}" failed: ${errMsg}`
                );
                useToastStore.getState().addToast(
                  `Action Group "${job.actionGroupName}" failed: ${errMsg}`,
                  'error'
                );
              }

              return {
                ...job,
                status,
                completedSteps,
                progress,
                totalSteps,
              };
            });

            return { backgroundJobs: updatedJobs };
          });

          // Update currently viewed activeRun
          if (isInspecting) {
            const currentRun = get().activeRun;
            if (!currentRun) return;

            switch (type) {
              case 'run:started':
                break;

              case 'step:started': {
                const stepIteration = message.iteration || 1;
                const tempResult: StepResult = {
                  stepId: message.stepId,
                  stepName: message.stepName,
                  iteration: stepIteration,
                  status: 0,
                  statusText: 'Executing...',
                  responseTime: 0,
                  responseSize: 0,
                  responseHeaders: {},
                  responseBody: '',
                  contentType: 'text/plain',
                  extractedData: {},
                  assertions: [],
                  timestamp: new Date().toISOString(),
                  url: '',
                  method: 'GET',
                };

                set({
                  activeRun: {
                    ...currentRun,
                    results: [
                      ...currentRun.results.filter((r) => !(r.stepId === message.stepId && r.iteration === stepIteration)),
                      tempResult,
                    ],
                  },
                });

                if (!get().selectedStepId) {
                  set({ selectedStepId: message.stepId, selectedIteration: stepIteration });
                }
                break;
              }

              case 'step:completed': {
                const stepIteration = message.iteration || 1;
                const updatedResult: StepResult = {
                  stepId: message.stepId,
                  stepName: message.stepName,
                  iteration: stepIteration,
                  status: message.statusCode,
                  statusText: String(message.statusCode),
                  responseTime: message.responseTime,
                  responseSize: 0,
                  responseHeaders: {},
                  responseBody: '',
                  contentType: 'application/json',
                  extractedData: message.extractedData,
                  assertions: message.assertions,
                  timestamp: new Date().toISOString(),
                  url: message.url || '',
                  method: message.method || 'GET',
                };

                set({
                  activeRun: {
                    ...currentRun,
                    results: currentRun.results.map((r) =>
                      r.stepId === message.stepId && r.iteration === stepIteration ? { ...r, ...updatedResult } : r
                    ),
                  },
                });
                break;
              }

              case 'step:failed': {
                const stepIteration = message.iteration || 1;
                const updatedResult: Partial<StepResult> = {
                  status: 0,
                  statusText: 'Failed',
                  error: message.error,
                  responseTime: message.responseTime || 0,
                  timestamp: new Date().toISOString(),
                  url: message.url || '',
                  method: message.method || 'GET',
                };

                set({
                  activeRun: {
                    ...currentRun,
                    results: currentRun.results.map((r) =>
                      r.stepId === message.stepId && r.iteration === stepIteration ? { ...r, ...updatedResult } : r
                    ),
                  },
                });
                break;
              }

              case 'run:completed': {
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
                break;
              }

              case 'run:failed': {
                set({
                  activeRun: {
                    ...currentRun,
                    status: 'failed',
                  },
                  isRunning: false,
                  error: message.error,
                });
                break;
              }
            }
          }
        } catch (err) {
          console.error('Failed to parse WebSocket execution event', err);
        }
      };

      ws.onclose = () => {
        console.log('[WS] Global socket connection closed, reconnecting in 3s...');
        setTimeout(() => connect(), 3000);
      };

      ws.onerror = (err) => {
        console.error('[WS] Global socket error', err);
      };
    };

    connect();
  },

  startRun: async (bucketId, groupId, config, actionGroupName = '') => {
    set({ isRunning: true, error: null, activeRun: null, selectedStepId: null });

    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bucketId, groupId, config }),
      });

      if (!res.ok) {
        throw new Error('Failed to initiate execution run');
      }

      const { runId } = await res.json();

      // Add to background jobs list
      const iters = config?.iterations || 1;
      const newJob: BackgroundJob = {
        runId,
        bucketId,
        actionGroupId: groupId,
        actionGroupName: actionGroupName || 'API Flow',
        status: 'running',
        progress: 0,
        totalSteps: iters, // Will be updated correctly on run:started event
        completedSteps: 0,
        createdAt: new Date().toISOString(),
      };

      set((state) => ({
        backgroundJobs: [newJob, ...state.backgroundJobs].slice(0, 20),
      }));

      // Initialize/verify global WebSocket connection
      get().initializeGlobalSocket();

      // Subscribe to updates for this runId
      if (wsInstance && wsInstance.readyState === WebSocket.OPEN) {
        wsInstance.send(JSON.stringify({ type: 'subscribe', runId }));
      }

      // Initialize activeRun local representation
      const initialRun: ExecutionRun = {
        id: runId,
        bucketId,
        actionGroupId: groupId,
        actionGroupName: actionGroupName || 'API Flow',
        config: config || {
          mode: 'manual',
          iterations: 1,
          concurrency: 1,
          delayBetweenSteps: 0,
          useDataStore: false,
        },
        status: 'running',
        results: [],
        createdAt: new Date().toISOString(),
      };

      set({ activeRun: initialRun });

      return runId;
    } catch (err: any) {
      set({ isRunning: false, error: err.message || 'Failed to start run' });
      throw err;
    }
  },

  stopRun: () => {
    set({ isRunning: false });
  },
}));
