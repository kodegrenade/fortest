import type { TestBucket } from '@fortest/types';
import { effectiveVariables, interpolate, redact, secretsOf } from '@fortest/utils';

/** The bucket's base URL as its runs will call it (active environment), with secret values masked. */
export function displayBaseUrl(bucket: TestBucket): string {
  const variables = effectiveVariables(bucket);
  return redact(interpolate(bucket.baseUrl || '', variables).resolved, secretsOf(variables));
}

interface ParsedVariable {
  key: string;
  value: string;
  enabled: boolean;
}

/**
 * Parses a bulk text input into an array of key-value variables.
 * Supports:
 * - JSON Array: [{"key": "k", "value": "v"}, ...]
 * - JSON Object: {"key": "value"}
 * - Line-based (.env, export K=V, K: V, space/tab separated)
 */
export function parseBulkVariables(text: string): ParsedVariable[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // 1. Try JSON parsing
  try {
    const parsed = JSON.parse(trimmed);

    // Case A: Array of objects
    if (Array.isArray(parsed)) {
      const vars: ParsedVariable[] = [];
      for (const item of parsed) {
        if (item && typeof item === 'object') {
          const key = (item.key ?? item.name ?? item.k ?? '').toString().trim();
          const value = (item.value !== undefined ? item.value : (item.v !== undefined ? item.v : '')).toString();
          const enabled = item.enabled !== false;
          if (key) {
            vars.push({ key, value, enabled });
          }
        }
      }
      if (vars.length > 0) return vars;
    }

    // Case B: Simple key-value object
    if (typeof parsed === 'object' && parsed !== null) {
      const vars: ParsedVariable[] = [];
      for (const [k, v] of Object.entries(parsed)) {
        const key = k.trim();
        const value = v !== null && v !== undefined ? String(v) : '';
        if (key) {
          vars.push({ key, value, enabled: true });
        }
      }
      if (vars.length > 0) return vars;
    }
  } catch (e) {
    // If JSON parsing fails, fall through to line-based parsing
  }

  // 2. Line-based parsing (e.g. .env, key=value, key: value)
  const lines = trimmed.split(/\r?\n/);
  const vars: ParsedVariable[] = [];

  for (const line of lines) {
    const lineTrimmed = line.trim();
    
    // Skip empty lines or comments
    if (!lineTrimmed || lineTrimmed.startsWith('#') || lineTrimmed.startsWith('//')) {
      continue;
    }

    let cleanLine = lineTrimmed;
    // Strip leading "export " if present
    if (cleanLine.startsWith('export ')) {
      cleanLine = cleanLine.substring(7).trim();
    }

    let key = '';
    let value = '';

    const eqIndex = cleanLine.indexOf('=');
    const colonIndex = cleanLine.indexOf(':');

    if (eqIndex !== -1) {
      key = cleanLine.substring(0, eqIndex).trim();
      value = cleanLine.substring(eqIndex + 1).trim();
    } else if (colonIndex !== -1) {
      key = cleanLine.substring(0, colonIndex).trim();
      value = cleanLine.substring(colonIndex + 1).trim();
    } else {
      // Split by first whitespace/tab
      const parts = cleanLine.split(/[\t ]+/);
      if (parts.length >= 2) {
        key = (parts[0] || '').trim();
        value = parts.slice(1).join(' ').trim();
      } else {
        key = cleanLine.trim();
        value = '';
      }
    }

    // Strip wrapping quotes from value
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.substring(1, value.length - 1);
    }

    if (key) {
      vars.push({ key, value, enabled: true });
    }
  }

  return vars;
}
