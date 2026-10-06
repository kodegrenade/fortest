import type { StepResult } from '@fortest/types';

/** The one failure rule (runner metrics, body retention, UI): network error, HTTP error status, or a failed assertion. */
export const isFailedResult = (r: Pick<StepResult, 'status' | 'error' | 'assertions'>) =>
  r.status === 0 || r.status >= 400 || !!r.error || r.assertions.some((a) => !a.passed);
