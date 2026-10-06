import type { KeyValuePair } from '@fortest/types';

/**
 * Parse a form-data / x-www-form-urlencoded step body.
 * Stored format is a JSON array of {key, value, enabled} (what the editor and Postman import write);
 * hand-written or legacy content may be a query string (`a=1&b=2`), which is accepted too.
 */
export function parseFormPairs(content: string): KeyValuePair[] {
  try {
    const parsed: unknown = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed.map((p) => ({
        id: typeof p?.id === 'string' ? p.id : crypto.randomUUID(),
        key: String(p?.key ?? ''),
        value: String(p?.value ?? ''),
        enabled: p?.enabled !== false,
      }));
    }
  } catch {
    // Not JSON: fall through to the query-string format.
  }
  // URLSearchParams never throws on malformed escapes like `100%`.
  return [...new URLSearchParams(content)].map(([key, value]) => ({
    id: crypto.randomUUID(),
    key,
    value,
    enabled: true,
  }));
}
