import type { ProxyResponse, ExtractionSource, AssertionTarget } from '@fortest/types';

const WHOLE_BODY = new Set(['', 'body', 'response.body']);

/**
 * Resolves a dot-notation selector against a nested object. Accepts array indexes and an
 * optional `body.` / `response.body.` prefix.
 * Example: resolveDotPath({ users: [{ id: 7 }] }, 'body.users[0].id') => 7
 */
export function resolveDotPath(obj: any, path: string): any {
  const clean = path.replace(/^(response\.)?body\./, '');
  if (!clean) return obj;
  return clean
    .replace(/\[(\d+)\]/g, '.$1')
    .split('.')
    .reduce((current, key) => current?.[key], obj);
}

/** The raw value a selector points at in a response (undefined if absent). */
export function selectValue(
  response: ProxyResponse,
  source: ExtractionSource | AssertionTarget,
  selector: string,
): unknown {
  switch (source) {
    case 'status':
      return response.status;
    case 'response_time':
      return response.time;
    case 'header': {
      const name = selector.toLowerCase();
      return Object.entries(response.headers).find(([key]) => key.toLowerCase() === name)?.[1];
    }
    case 'body':
      if (WHOLE_BODY.has(selector)) return response.body;
      try {
        return resolveDotPath(JSON.parse(response.body), selector);
      } catch {
        return undefined; // dot paths need a JSON body
      }
  }
}

/** String form of a selected value; objects and arrays become JSON. */
export function stringify(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

/**
 * Extracts a value from a step's response according to an extraction source and selector.
 */
export function extractValue(
  response: ProxyResponse,
  source: ExtractionSource,
  selector: string,
): string | null {
  return stringify(selectValue(response, source, selector));
}
