import { create } from 'zustand';
import type { ExecutionRun, ExecutionConfig, RunEvent, RunSummary } from '@fortest/types';
import { applyRunEvent } from '@fortest/utils';
import { useToastStore } from './toastStore';
import { regressionLabel } from '@/utils/results';

export interface BackgroundJob {
  runId: string;
  bucketId: string;
  actionGroupId: string;
  actionGroupName: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
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
  pastRuns: RunSummary[];
  pastRunsLoading: boolean;
  backgroundJobs: BackgroundJob[];

  // Actions
  initializeGlobalSocket: () => void;
  startRun: (
    bucketId: string,
    groupId: string,
    config?: ExecutionConfig,
    actionGroupName?: string,
  ) => Promise<string>;
  cancelRun: (runId: string) => Promise<void>;
  selectStep: (stepId: string | null, iteration?: number | null) => void;
  clearRun: () => void;
  loadRuns: (groupId: string) => Promise<void>;
  viewHistoricalRun: (runId: string) => Promise<void>;
  removeBackgroundJob: (runId: string) => void;
}

const getWsUrl = (): string => {
  const loc = window.location;
  const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${loc.host}/ws`;
};

let wsInstance: WebSocket | null = null;

/** Live updates for a run; the server answers with a snapshot, then streams events. */
function subscribe(runId: string) {
  if (wsInstance?.readyState === WebSocket.OPEN) {
    wsInstance.send(JSON.stringify({ type: 'subscribe', runId }));
  }
}

function showNativeNotification(title: string, body: string) {
  if (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    Notification.permission === 'granted'
  ) {
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

/** Toast + OS notification when a background run ends. */
function notifyFinished(job: BackgroundJob, run: RunSummary) {
  const failed = run.metrics?.failed ?? 0;
  const [title, message, type] =
    run.status === 'cancelled'
      ? [
          'Execution Cancelled',
          `Action Group "${job.actionGroupName}" was cancelled.`,
          'info' as const,
        ]
      : run.status === 'failed'
        ? [
            'Execution Failed',
            `Action Group "${job.actionGroupName}" failed: ${run.error || 'Unknown error'}`,
            'error' as const,
          ]
        : failed > 0
          ? [
              'Execution Failed',
              `Action Group "${job.actionGroupName}" completed with ${failed} failure(s).`,
              'error' as const,
            ]
          : [
              'Execution Completed',
              `Action Group "${job.actionGroupName}" completed successfully.`,
              'success' as const,
            ];
  showNativeNotification(title, message);
  useToastStore.getState().addToast(message, type);
  if (run.regression) {
    useToastStore
      .getState()
      .addToast(`"${job.actionGroupName}" was slower than usual: ${regressionLabel(run.regression)}`, 'warning');
  }
}

/** A background job's progress after an event. */
function updateJob(job: BackgroundJob, event: RunEvent): BackgroundJob {
  switch (event.type) {
    case 'run:snapshot':
      return { ...job, completedSteps: Math.max(job.completedSteps, event.run.results.length) };
    case 'run:started':
      return { ...job, totalSteps: event.totalSteps * event.totalIterations };
    case 'step:finished': {
      const completedSteps = job.completedSteps + 1;
      return {
        ...job,
        completedSteps,
        progress: Math.min(Math.round((completedSteps / (job.totalSteps || 1)) * 100), 99),
      };
    }
    case 'run:finished': {
      notifyFinished(job, event.run);
      const failed = event.run.status === 'completed' && (event.run.metrics?.failed ?? 0) > 0;
      return {
        ...job,
        status: failed ? 'failed' : (event.run.status as BackgroundJob['status']),
        progress: 100,
      };
    }
    default:
      return job;
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

  selectStep: (stepId, iteration = 1) =>
    set({ selectedStepId: stepId, selectedIteration: iteration }),

  removeBackgroundJob: (runId) => {
    set((state) => ({
      backgroundJobs: state.backgroundJobs.filter((j) => j.runId !== runId),
    }));
  },

  clearRun: () => {
    set({
      activeRun: null,
      isRunning: false,
      error: null,
      selectedStepId: null,
      selectedIteration: null,
    });
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
      const run: ExecutionRun = await res.json();
      set({ activeRun: run, isRunning: run.status === 'running' });
      if (run.status === 'running') subscribe(runId); // keep it live
    } catch (err: any) {
      console.error(err);
      set({ error: err.message || 'Failed to inspect run' });
    }
  },

  initializeGlobalSocket: () => {
    if (
      wsInstance &&
      (wsInstance.readyState === WebSocket.CONNECTING || wsInstance.readyState === WebSocket.OPEN)
    ) {
      return;
    }

    const connect = () => {
      const ws = new WebSocket(getWsUrl());
      wsInstance = ws;

      ws.onopen = () => {
        // (Re)subscribe to runs still in progress; each answers with a fresh snapshot.
        for (const job of get().backgroundJobs) if (job.status === 'running') subscribe(job.runId);
        const { activeRun } = get();
        if (activeRun?.status === 'running') subscribe(activeRun.id);
      };

      ws.onmessage = (message) => {
        let event: RunEvent;
        try {
          event = JSON.parse(message.data);
        } catch (err) {
          console.error('Failed to parse WebSocket execution event', err);
          return;
        }

        set((state) => {
          const isActive = state.activeRun?.id === event.runId;
          const activeRun = isActive ? applyRunEvent(state.activeRun, event) : state.activeRun;
          const finished = event.type === 'run:finished' ? event.run : null;
          return {
            activeRun,
            ...(isActive && finished ? { isRunning: false } : {}),
            ...(isActive && !state.selectedStepId && event.type === 'step:started'
              ? { selectedStepId: event.stepId, selectedIteration: event.iteration }
              : {}),
            pastRuns: state.pastRuns.map((r) =>
              r.id !== event.runId
                ? r
                : (finished ??
                  (event.type === 'run:started' ? { ...r, status: 'running' as const } : r)),
            ),
            backgroundJobs: state.backgroundJobs.map((job) =>
              job.runId === event.runId && job.status === 'running' ? updateJob(job, event) : job,
            ),
          };
        });
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
        throw new Error(
          (await res.json().catch(() => null))?.message || 'Failed to initiate execution run',
        );
      }

      const { runId } = await res.json();
      const name = actionGroupName || 'API Flow';
      const now = new Date().toISOString();

      // Local copy until the snapshot and events arrive.
      const initialRun: ExecutionRun = {
        id: runId,
        bucketId,
        actionGroupId: groupId,
        actionGroupName: name,
        config: config || {
          mode: 'manual',
          iterations: 1,
          concurrency: 1,
          delayBetweenSteps: 0,
          useDataStore: false,
        },
        status: 'running',
        results: [],
        createdAt: now,
      };
      const job: BackgroundJob = {
        runId,
        bucketId,
        actionGroupId: groupId,
        actionGroupName: name,
        status: 'running',
        progress: 0,
        totalSteps: config?.iterations || 1, // corrected by run:started
        completedSteps: 0,
        createdAt: now,
      };

      set((state) => ({
        activeRun: initialRun,
        pastRuns: [initialRun, ...state.pastRuns].slice(0, 50),
        backgroundJobs: [job, ...state.backgroundJobs].slice(0, 20),
      }));

      get().initializeGlobalSocket();
      subscribe(runId);
      return runId;
    } catch (err: any) {
      set({ isRunning: false, error: err.message || 'Failed to start run' });
      throw err;
    }
  },

  cancelRun: async (runId) => {
    const res = await fetch(`/api/runs/${runId}/cancel`, { method: 'POST' });
    // 404: it finished on its own meanwhile; run:finished will (or did) arrive anyway.
    if (!res.ok && res.status !== 404) {
      useToastStore.getState().addToast('Failed to cancel run', 'error');
    }
  },
}));
