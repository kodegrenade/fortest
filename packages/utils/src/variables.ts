import type { BucketVariable } from '@fortest/types';

/**
 * Resolve {{variable}} placeholders in a string using environment variables.
 * Unresolved variables are left as-is (e.g., {{unknown}} stays as {{unknown}}).
 */
export function interpolate(
  template: string,
  variables: BucketVariable[],
): { resolved: string; unresolvedKeys: string[] } {
  const unresolvedKeys: string[] = [];
  const enabledVars = new Map(
    variables.filter((v) => v.enabled).map((v) => [v.key, v.value]),
  );

  const resolved = template.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_match, rawKey: string) => {
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
