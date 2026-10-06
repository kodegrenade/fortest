import type { CSSProperties } from 'react';
import type { RunSummary, StepResult } from '@fortest/types';

/** A live-run placeholder for a step that hasn't responded yet. */
export const isExecuting = (r: StepResult) => r.statusText === 'Executing...';

/** Same rule as the API's computeMetrics: network error, HTTP error status, or a failed assertion. */
export const isFailedResult = (r: StepResult) =>
  !isExecuting(r) &&
  (r.status === 0 || r.status >= 400 || !!r.error || r.assertions.some((a) => !a.passed));

export type Tone = 'passed' | 'failed' | 'running' | 'pending';

export const TONE_COLOR: Record<Tone, string> = {
  passed: 'var(--status-2xx)',
  failed: 'var(--status-5xx)',
  running: 'var(--accent-primary)',
  pending: 'var(--text-tertiary)',
};

/** Tone for a run verdict or background-job status. */
export const runTone = (status: string): Tone =>
  status === 'completed' || status === 'passed'
    ? 'passed'
    : status === 'failed'
      ? 'failed'
      : status === 'running'
        ? 'running'
        : 'pending';

export type RunVerdict = 'passed' | 'failed' | 'running' | 'cancelled' | 'pending';

/** A run's outcome as users read it: "completed" only means it ran to the end, so any failed request makes it failed. */
export const runVerdict = (run: Pick<RunSummary, 'status' | 'metrics'>): RunVerdict =>
  run.status === 'completed' ? ((run.metrics?.failed ?? 0) > 0 ? 'failed' : 'passed') : run.status;

export const VERDICT_LABEL: Record<RunVerdict, string> = {
  passed: 'Passed',
  failed: 'Failed',
  running: 'Running',
  cancelled: 'Cancelled',
  pending: 'Pending',
};

/** A theme color at the given opacity (follows the active color preset). */
export const tint = (color: string, percent: number) =>
  `color-mix(in srgb, ${color} ${percent}%, transparent)`;

/** Colored text on a faint background of the same color, for status badges. */
export const toneBadge = (tone: Tone, background = 10, border = 15): CSSProperties => ({
  color: TONE_COLOR[tone],
  backgroundColor: tint(TONE_COLOR[tone], background),
  border: `1px solid ${tint(TONE_COLOR[tone], border)}`,
});

/** Pretty-prints JSON text; anything else comes back unchanged. */
export function prettyJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** " · 3 attempts in 4.1s" for retrying steps, "" otherwise. */
export const attemptsLabel = (r: StepResult) =>
  r.attempts
    ? ` · ${r.attempts} attempt${r.attempts === 1 ? '' : 's'} in ${((r.elapsedMs ?? 0) / 1000).toFixed(1)}s`
    : '';

/** "p95 742ms vs usual 310ms (+139%)" for a run flagged as slower than usual. */
export const regressionLabel = (r: NonNullable<RunSummary['regression']>) =>
  `p95 ${r.p95}ms vs usual ${Math.round(r.baselineP95)}ms (+${Math.round((r.p95 / r.baselineP95 - 1) * 100)}%)`;

/** Amber "slower than usual" badge, with the numbers in its tooltip. */
export const regressionBadgeStyle: CSSProperties = {
  color: 'var(--status-3xx)',
  backgroundColor: tint('var(--status-3xx)', 12),
  border: `1px solid ${tint('var(--status-3xx)', 25)}`,
  fontSize: '10px',
  padding: '2px 6px',
  borderRadius: '4px',
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${parseFloat((bytes / 1024).toFixed(2))} KB`;
  return `${parseFloat((bytes / 1024 / 1024).toFixed(2))} MB`;
}

const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

/** "Just now", "5 minutes ago", "yesterday" (for timestamps in the past). */
export function relativeTime(iso: string): string {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  if (Math.abs(seconds) < 60) return 'Just now';
  for (const [unit, size] of [['day', 86400], ['hour', 3600], ['minute', 60]] as const) {
    if (Math.abs(seconds) >= size) return relativeFormat.format(Math.round(seconds / size), unit);
  }
  return '';
}
