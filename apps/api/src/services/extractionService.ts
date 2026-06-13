import type { ProxyResponse, ExtractionSource } from '@fortest/types';

/**
 * Resolves a dot-notation selector string against a nested object.
 * Example: resolveDotPath({ user: { profile: { id: 123 } } }, 'user.profile.id') => 123
 */
export function resolveDotPath(obj: any, path: string): any {
  if (obj === null || obj === undefined) return undefined;
  if (!path) return obj;
  
  // Clean up prefix if user entered it (e.g. response.body.data => data)
  let cleanPath = path;
  if (cleanPath.startsWith('response.body.')) {
    cleanPath = cleanPath.slice('response.body.'.length);
  } else if (cleanPath.startsWith('body.')) {
    cleanPath = cleanPath.slice('body.'.length);
  }
  
  if (!cleanPath) return obj;

  const parts = cleanPath.split('.');
  let current = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    // Handle array indexes if present (e.g. users[0])
    const arrayMatch = part.match(/^([^\[]+)\[(\d+)\]$/);
    if (arrayMatch && arrayMatch[1] && arrayMatch[2]) {
      const key = arrayMatch[1];
      const index = parseInt(arrayMatch[2], 10);
      current = current[key];
      if (Array.isArray(current)) {
        current = current[index];
      } else {
        return undefined;
      }
    } else {
      current = current[part];
    }
  }
  
  return current;
}

/**
 * Extracts a value from a step's proxy response according to an extraction source and selector.
 */
export function extractValue(
  response: ProxyResponse,
  source: ExtractionSource,
  selector: string
): string | null {
  if (source === 'status') {
    return String(response.status);
  }
  if (source === 'header') {
    const headers = response.headers;
    const lowerSelector = selector.toLowerCase();
    // Case-insensitive lookup
    for (const key of Object.keys(headers)) {
      if (key.toLowerCase() === lowerSelector) {
        return headers[key] ?? null;
      }
    }
    return null;
  }

  // Parse body as JSON
  try {
    const parsedBody = JSON.parse(response.body);
    const value = resolveDotPath(parsedBody, selector);
    if (value === undefined || value === null) {
      return null;
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  } catch {
    // If response body is not JSON, we cannot parse dot notation paths.
    // However, if the selector is empty or matches the whole body, return it raw.
    if (!selector || selector === 'body' || selector === 'response.body') {
      return response.body;
    }
    return null;
  }
}
