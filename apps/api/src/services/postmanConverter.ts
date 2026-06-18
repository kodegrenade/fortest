import { v4 as uuidv4 } from 'uuid';
import type { TestBucket, ActionGroup, Step, BucketVariable } from '@fortest/types';
import type { AuthConfig, RequestBody, KeyValuePair } from '@fortest/types';

// ---------------------------------------------------------------------------
// Postman Collection Types (v2.0 / v2.1)
// ---------------------------------------------------------------------------

interface PostmanInfo {
  name: string;
  description?: string;
  schema?: string;
  _postman_id?: string;
}

interface PostmanVariable {
  key: string;
  value: string;
  type?: string;
  disabled?: boolean;
}

interface PostmanAuthParam {
  key: string;
  value: string;
  type?: string;
}

interface PostmanAuth {
  type: string;
  bearer?: PostmanAuthParam[];
  basic?: PostmanAuthParam[];
  apikey?: PostmanAuthParam[];
  [key: string]: unknown;
}

interface PostmanHeader {
  key: string;
  value: string;
  description?: string;
  disabled?: boolean;
}

interface PostmanQueryParam {
  key: string;
  value: string;
  description?: string;
  disabled?: boolean;
}

interface PostmanUrl {
  raw?: string;
  protocol?: string;
  host?: string[];
  port?: string;
  path?: string[];
  query?: PostmanQueryParam[];
}

interface PostmanBodyOptions {
  raw?: { language?: string };
}

interface PostmanFormParam {
  key: string;
  value?: string;
  type?: string;
  description?: string;
  disabled?: boolean;
}

interface PostmanBody {
  mode?: string;
  raw?: string;
  formdata?: PostmanFormParam[];
  urlencoded?: PostmanFormParam[];
  options?: PostmanBodyOptions;
}

interface PostmanRequest {
  method?: string;
  header?: PostmanHeader[];
  body?: PostmanBody;
  url?: PostmanUrl | string;
  auth?: PostmanAuth;
  description?: string;
}

interface PostmanItem {
  name?: string;
  description?: string;
  request?: PostmanRequest;
  item?: PostmanItem[];       // folders contain nested items
  auth?: PostmanAuth;
  variable?: PostmanVariable[];
  event?: unknown[];           // test scripts — skipped for v1
}

interface PostmanCollection {
  info: PostmanInfo;
  item: PostmanItem[];
  variable?: PostmanVariable[];
  auth?: PostmanAuth;
  event?: unknown[];
}

// ---------------------------------------------------------------------------
// Conversion Result
// ---------------------------------------------------------------------------

export interface ConversionResult {
  bucket: TestBucket;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Detects whether a parsed JSON object is a Postman Collection.
 * Checks for the `info.schema` URL pattern or the `_postman_id` field.
 */
export function isPostmanCollection(data: unknown): data is PostmanCollection {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return false;
  }

  const obj = data as Record<string, unknown>;
  const info = obj.info as Record<string, unknown> | undefined;

  if (!info || typeof info !== 'object') {
    return false;
  }

  // Check for schema URL (primary indicator)
  if (typeof info.schema === 'string') {
    const schema = info.schema.toLowerCase();
    if (
      schema.includes('schema.getpostman.com') ||
      schema.includes('schema.postman.com')
    ) {
      return true;
    }
  }

  // Fallback: check for _postman_id
  if (typeof info._postman_id === 'string' && info._postman_id.length > 0) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

/**
 * Converts a Postman Collection into a Fortest TestBucket.
 *
 * Strategy:
 *  - Top-level folders → Action Groups
 *  - Nested subfolders → flattened with "Parent / Child" naming
 *  - Root-level requests (not in any folder) → "Ungrouped Requests" Action Group
 *  - Common protocol+host across requests → bucket baseUrl
 *  - Postman variables → bucket variables
 *  - Auth types mapped where supported; unsupported types produce warnings
 */
export function convertPostmanCollection(data: PostmanCollection): ConversionResult {
  const warnings: string[] = [];
  const now = new Date().toISOString();

  // 1. Extract all requests with their folder paths for base URL detection
  const allRequests: { url: PostmanUrl | string | undefined; item: PostmanItem }[] = [];
  collectAllRequests(data.item, allRequests);

  // 2. Determine common base URL
  const baseUrl = extractCommonBaseUrl(allRequests);

  // 3. Convert collection-level variables
  const variables = convertVariables(data.variable || []);

  // 4. Convert collection-level auth
  const collectionAuth = convertAuth(data.auth, warnings, 'Collection');

  // 5. Convert items → Action Groups
  const actionGroups: ActionGroup[] = [];
  const ungroupedSteps: Step[] = [];
  let groupOrder = 0;

  for (const item of data.item) {
    if (isFolder(item)) {
      // Top-level folder → Action Group
      const steps = flattenFolderToSteps(item, baseUrl, warnings, now);
      if (steps.length > 0) {
        actionGroups.push({
          id: uuidv4(),
          name: item.name || `Action Group ${groupOrder + 1}`,
          description: typeof item.description === 'string' ? item.description : '',
          order: groupOrder,
          steps: deduplicateStepNames(steps),
          createdAt: now,
          updatedAt: now,
        });
        groupOrder++;
      }
    } else if (item.request) {
      // Root-level request → collect for ungrouped
      ungroupedSteps.push(convertRequestToStep(item, baseUrl, warnings, ungroupedSteps.length, now));
    }
  }

  // Add ungrouped requests as a catch-all Action Group
  if (ungroupedSteps.length > 0) {
    actionGroups.push({
      id: uuidv4(),
      name: 'Ungrouped Requests',
      description: 'Requests that were not inside any Postman folder',
      order: groupOrder,
      steps: deduplicateStepNames(ungroupedSteps),
      createdAt: now,
      updatedAt: now,
    });
  }

  // 6. Log warning if test scripts were present
  if (hasEventScripts(data)) {
    warnings.push('Postman test/pre-request scripts were detected but not imported. You can manually recreate assertions in the step editor.');
  }

  // 7. Assemble the bucket
  const bucket: TestBucket = {
    id: uuidv4(),
    name: data.info.name || 'Postman Import',
    baseUrl,
    auth: collectionAuth,
    variables,
    actionGroups,
    createdAt: now,
    updatedAt: now,
  };

  return { bucket, warnings };
}

// ---------------------------------------------------------------------------
// Internal Helpers
// ---------------------------------------------------------------------------

/** Checks if a Postman item is a folder (has nested items, no request). */
function isFolder(item: PostmanItem): boolean {
  return Array.isArray(item.item) && item.item.length > 0;
}

/** Recursively collects all request items for base URL scanning. */
function collectAllRequests(
  items: PostmanItem[],
  out: { url: PostmanUrl | string | undefined; item: PostmanItem }[],
): void {
  for (const item of items) {
    if (item.request) {
      out.push({ url: item.request.url, item });
    }
    if (item.item) {
      collectAllRequests(item.item, out);
    }
  }
}

/** Extracts a common base URL from all requests in the collection. */
function extractCommonBaseUrl(
  requests: { url: PostmanUrl | string | undefined }[],
): string {
  const hostCounts = new Map<string, number>();

  for (const { url } of requests) {
    const parsed = resolveUrl(url);
    if (parsed.host) {
      const key = `${parsed.protocol}://${parsed.host}${parsed.port ? ':' + parsed.port : ''}`;
      hostCounts.set(key, (hostCounts.get(key) || 0) + 1);
    }
  }

  if (hostCounts.size === 0) return '';

  // Pick the most frequently occurring host
  let bestHost = '';
  let bestCount = 0;
  for (const [host, count] of hostCounts) {
    if (count > bestCount) {
      bestHost = host;
      bestCount = count;
    }
  }

  return bestHost;
}

interface ResolvedUrl {
  protocol: string;
  host: string;
  port: string;
  path: string;
  query: PostmanQueryParam[];
}

/** Normalizes a Postman URL (string or object) into its components. */
function resolveUrl(url: PostmanUrl | string | undefined): ResolvedUrl {
  const empty: ResolvedUrl = { protocol: 'https', host: '', port: '', path: '/', query: [] };

  if (!url) return empty;

  if (typeof url === 'string') {
    return parseUrlString(url);
  }

  // Object form
  const protocol = url.protocol || 'https';
  const host = Array.isArray(url.host) ? url.host.join('.') : '';
  const port = url.port || '';
  const path = Array.isArray(url.path) ? '/' + url.path.join('/') : '/';
  const query = url.query || [];

  return { protocol, host, port, path, query };
}

/** Parses a raw URL string into components. */
function parseUrlString(raw: string): ResolvedUrl {
  const result: ResolvedUrl = { protocol: 'https', host: '', port: '', path: '/', query: [] };

  try {
    // Handle Postman variables in the URL — replace {{...}} temporarily for URL parsing
    const sanitized = raw.replace(/\{\{([^}]+)\}\}/g, '__PM_VAR_$1__');

    // Check if it's a valid full URL or a relative path
    let urlObj: URL;
    if (sanitized.match(/^https?:\/\//i)) {
      urlObj = new URL(sanitized);
    } else if (sanitized.startsWith('//')) {
      urlObj = new URL('https:' + sanitized);
    } else {
      // Relative path — no host to extract
      result.path = restoreVariables(raw.split('?')[0] || '/');
      return result;
    }

    result.protocol = restoreVariables(urlObj.protocol.replace(':', ''));
    result.host = restoreVariables(urlObj.hostname);
    result.port = restoreVariables(urlObj.port);
    result.path = restoreVariables(urlObj.pathname || '/');
  } catch {
    // If URL parsing fails, treat the whole thing as a path
    result.path = raw;
  }

  return result;
}

/** Restores Postman `{{variable}}` syntax from the sanitized placeholder. */
function restoreVariables(str: string): string {
  return str.replace(/__PM_VAR_([^_]+)__/g, '{{$1}}');
}

/** Extracts the step path relative to the base URL. */
function extractStepPath(url: PostmanUrl | string | undefined, baseUrl: string): string {
  const resolved = resolveUrl(url);
  const fullHost = `${resolved.protocol}://${resolved.host}${resolved.port ? ':' + resolved.port : ''}`;

  if (baseUrl && fullHost === baseUrl) {
    // Same host as base — use relative path
    return resolved.path || '/';
  }

  if (baseUrl && !resolved.host) {
    // No host in URL — already relative
    return resolved.path || '/';
  }

  if (!baseUrl) {
    // No common base URL — use full raw URL
    if (typeof url === 'string') return url;
    if (url?.raw) return url.raw;
    return resolved.path || '/';
  }

  // Different host — store full URL so it still works at execution time
  if (resolved.host) {
    return `${fullHost}${resolved.path}`;
  }

  return resolved.path || '/';
}

/** Extracts query parameters from a Postman URL and merges them into params. */
function extractQueryParams(url: PostmanUrl | string | undefined): KeyValuePair[] {
  if (!url || typeof url === 'string') return [];

  const query = url.query || [];
  return query
    .filter((q) => q.key)
    .map((q) => ({
      id: uuidv4(),
      key: q.key,
      value: q.value || '',
      enabled: !q.disabled,
      description: q.description,
    }));
}

// --- Auth Conversion ---

function convertAuth(
  auth: PostmanAuth | undefined,
  warnings: string[],
  context: string,
): AuthConfig {
  if (!auth || auth.type === 'noauth' || !auth.type) {
    return { type: 'none' };
  }

  const type = auth.type.toLowerCase();

  if (type === 'bearer') {
    const params = normalizeAuthParams(auth.bearer);
    const token = params.get('token') || '';
    return { type: 'bearer', bearer: { token } };
  }

  if (type === 'basic') {
    const params = normalizeAuthParams(auth.basic);
    return {
      type: 'basic',
      basic: {
        username: params.get('username') || '',
        password: params.get('password') || '',
      },
    };
  }

  if (type === 'apikey') {
    const params = normalizeAuthParams(auth.apikey);
    const addTo = params.get('in') === 'query' ? 'query' as const : 'header' as const;
    return {
      type: 'api-key',
      apiKey: {
        key: params.get('key') || '',
        value: params.get('value') || '',
        addTo,
      },
    };
  }

  // Unsupported auth type
  warnings.push(`${context}: Unsupported auth type "${auth.type}" was skipped. You may need to configure auth manually.`);
  return { type: 'none' };
}

/** Postman v2.1 stores auth params as arrays of {key,value}; v2.0 as objects. */
function normalizeAuthParams(
  params: PostmanAuthParam[] | Record<string, string> | undefined,
): Map<string, string> {
  const map = new Map<string, string>();

  if (!params) return map;

  if (Array.isArray(params)) {
    for (const p of params) {
      if (p.key) map.set(p.key, p.value || '');
    }
  } else if (typeof params === 'object') {
    for (const [k, v] of Object.entries(params)) {
      map.set(k, typeof v === 'string' ? v : '');
    }
  }

  return map;
}

// --- Body Conversion ---

function convertBody(body: PostmanBody | undefined): RequestBody {
  if (!body || !body.mode) {
    return { type: 'none', content: '' };
  }

  switch (body.mode) {
    case 'raw': {
      const lang = body.options?.raw?.language?.toLowerCase();
      if (lang === 'json') {
        return { type: 'json', content: body.raw || '' };
      }
      if (lang === 'xml') {
        return { type: 'xml', content: body.raw || '' };
      }
      return { type: 'raw', content: body.raw || '' };
    }

    case 'formdata': {
      // Serialize form-data entries as JSON key-value array for Fortest
      const entries = (body.formdata || [])
        .filter((f) => !f.disabled)
        .map((f) => ({ key: f.key, value: f.value || '' }));
      return { type: 'form-data', content: JSON.stringify(entries) };
    }

    case 'urlencoded': {
      const entries = (body.urlencoded || [])
        .filter((f) => !f.disabled)
        .map((f) => ({ key: f.key, value: f.value || '' }));
      return { type: 'x-www-form-urlencoded', content: JSON.stringify(entries) };
    }

    default:
      return { type: 'none', content: '' };
  }
}

// --- Header Conversion ---

function convertHeaders(headers: PostmanHeader[] | undefined): KeyValuePair[] {
  if (!headers) return [];

  return headers
    .filter((h) => h.key)
    .map((h) => ({
      id: uuidv4(),
      key: h.key,
      value: h.value || '',
      enabled: !h.disabled,
      description: h.description,
    }));
}

// --- Variable Conversion ---

function convertVariables(variables: PostmanVariable[]): BucketVariable[] {
  return variables
    .filter((v) => v.key)
    .map((v) => ({
      id: uuidv4(),
      key: v.key,
      value: v.value || '',
      enabled: !v.disabled,
    }));
}

// --- Folder → Steps Flattening ---

/**
 * Recursively flattens a folder and all its subfolders into a flat list of Steps.
 * Nested subfolder items are prefixed with the folder path for naming clarity.
 */
function flattenFolderToSteps(
  folder: PostmanItem,
  baseUrl: string,
  warnings: string[],
  now: string,
  parentPrefix?: string,
): Step[] {
  const steps: Step[] = [];
  const items = folder.item || [];

  for (const item of items) {
    if (isFolder(item)) {
      // Nested subfolder — flatten with parent/child naming
      const prefix = parentPrefix
        ? `${parentPrefix} / ${item.name || 'Folder'}`
        : item.name || 'Folder';

      warnings.push(`Nested folder "${prefix}" was flattened into its parent Action Group.`);

      const nestedSteps = flattenFolderToSteps(item, baseUrl, warnings, now, prefix);
      steps.push(...nestedSteps);
    } else if (item.request) {
      steps.push(convertRequestToStep(item, baseUrl, warnings, steps.length, now));
    }
  }

  return steps;
}

// --- Request → Step Conversion ---

function convertRequestToStep(
  item: PostmanItem,
  baseUrl: string,
  warnings: string[],
  order: number,
  now: string,
): Step {
  const req = item.request!;
  const method = (req.method || 'GET').toUpperCase();

  // Validate method against supported methods
  const supportedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
  const finalMethod = supportedMethods.includes(method) ? method : 'GET';
  if (!supportedMethods.includes(method)) {
    warnings.push(`Request "${item.name}": Unsupported HTTP method "${method}" was defaulted to GET.`);
  }

  const path = extractStepPath(req.url, baseUrl);
  const headers = convertHeaders(req.header);
  const params = extractQueryParams(req.url);
  const body = convertBody(req.body);
  const auth = convertAuth(req.auth, warnings, `Step "${item.name || 'Unnamed'}"`);

  return {
    id: uuidv4(),
    name: item.name || `Step ${order + 1}`,
    order,
    method: finalMethod as any,
    path,
    headers,
    params,
    body,
    auth,
    extractions: [],
    assertions: [],
    createdAt: now,
    updatedAt: now,
  };
}

// --- Step Name Deduplication ---

/**
 * Ensures all step names within a group are unique by appending (2), (3), etc.
 * Consistent with the frontend's duplicateStep naming convention.
 */
function deduplicateStepNames(steps: Step[]): Step[] {
  const nameCount = new Map<string, number>();

  return steps.map((step) => {
    const lowerName = step.name.trim().toLowerCase();
    const count = nameCount.get(lowerName) || 0;

    if (count > 0) {
      const newName = `${step.name} (${count + 1})`;
      nameCount.set(lowerName, count + 1);
      return { ...step, name: newName };
    }

    nameCount.set(lowerName, 1);
    return step;
  });
}

// --- Event Script Detection ---

function hasEventScripts(collection: PostmanCollection): boolean {
  // Check collection-level events
  if (collection.event && collection.event.length > 0) return true;

  // Check item-level events recursively
  return itemsHaveEvents(collection.item);
}

function itemsHaveEvents(items: PostmanItem[]): boolean {
  for (const item of items) {
    if (item.event && (item.event as unknown[]).length > 0) return true;
    if (item.item && itemsHaveEvents(item.item)) return true;
  }
  return false;
}
