import type { CSSProperties } from 'react';
import type { StepResult } from '@fortest/types';

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

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${parseFloat((bytes / 1024).toFixed(2))} KB`;
  return `${parseFloat((bytes / 1024 / 1024).toFixed(2))} MB`;
}
