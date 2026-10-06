import type { Step } from '@fortest/types';

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Rewrites `{{steps.<oldName>.<var>}}` references to `newName` in every string of a step (path,
 * headers, params, body, auth, assertions). Returns the step and how many references changed.
 * Matches the exact name followed by a dot, so renaming "Login" leaves "Login 2" alone.
 */
export function renameStepReferences(
  step: Step,
  oldName: string,
  newName: string,
): { step: Step; count: number } {
  const pattern = new RegExp(`(\\{\\{\\s*steps\\.)${escapeRegExp(oldName)}(\\.)`, 'g');
  let count = 0;
  const rewrite = (value: unknown): unknown => {
    if (typeof value === 'string') {
      return value.replace(pattern, (_m, open: string, dot: string) => {
        count++;
        return `${open}${newName}${dot}`;
      });
    }
    if (Array.isArray(value)) return value.map(rewrite);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v)]));
    }
    return value;
  };
  const rewritten = rewrite(step) as Step;
  return { step: count ? rewritten : step, count };
}
