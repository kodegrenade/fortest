import type { EnvironmentVariable } from '@fortest/types';

/**
 * Resolve {{variable}} placeholders in a string using environment variables.
 * Unresolved variables are left as-is (e.g., {{unknown}} stays as {{unknown}}).
 */
export function interpolate(
  template: string,
  variables: EnvironmentVariable[],
): { resolved: string; unresolvedKeys: string[] } {
  const unresolvedKeys: string[] = [];
  const enabledVars = new Map(
    variables.filter((v) => v.enabled).map((v) => [v.key, v.value]),
  );

  const resolved = template.replace(/\{\{(\s*[\w.-]+\s*)\}\}/g, (_match, rawKey: string) => {
    const key = rawKey.trim();
    const value = enabledVars.get(key);
    if (value !== undefined) {
      return value;
    }
    unresolvedKeys.push(key);
    return `{{${key}}}`;
  });

  return { resolved, unresolvedKeys };
}

/**
 * Extract all variable keys referenced in a template string.
 */
export function extractVariableKeys(template: string): string[] {
  const keys: string[] = [];
  const regex = /\{\{(\s*[\w.-]+\s*)\}\}/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(template)) !== null) {
    const key = match[1]?.trim();
    if (key) {
      keys.push(key);
    }
  }
  return [...new Set(keys)];
}
