import type { BucketVariable } from '@fortest/types';

// Shorter values aren't redacted: masking every "1" or "abc" in a response would garble it.
const MIN_REDACTED_LENGTH = 4;

export interface Secret {
  key: string;
  value: string;
}

/**
 * Values to redact from run output: those of secret variables, plus any later variable (an
 * environment's, or a CLI --var) that sets a key some secret variable uses.
 */
export function secretsOf(variables: BucketVariable[]): Secret[] {
  const secretKeys = new Set(variables.filter((v) => v.secret).map((v) => v.key));
  return variables
    .filter((v) => secretKeys.has(v.key) && v.value.length >= MIN_REDACTED_LENGTH)
    .map(({ key, value }) => ({ key, value }))
    .sort((a, b) => b.value.length - a.value.length); // longest first, in case one contains another
}

/** Replaces each secret value in `text` with [secret:key]. */
export function redact(text: string, secrets: Secret[]): string {
  return secrets.reduce((out, s) => out.split(s.value).join(`[secret:${s.key}]`), text);
}
