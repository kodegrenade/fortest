import { randomUUID } from 'node:crypto';
import { HttpMethodSchema } from '@fortest/types';
import type {
  TestBucket,
  ActionGroup,
  Step,
  AuthConfig,
  RequestBody,
  KeyValuePair,
} from '@fortest/types';

// ---------------------------------------------------------------------------
// Postman Collection shapes (v2.0 / v2.1) — only the fields the converter reads
// ---------------------------------------------------------------------------

interface PostmanKV {
  key: string;
  value?: string;
  description?: string;
  disabled?: boolean;
  type?: string; // variables: "secret" for Postman secret variables
}

// Params live under the type's name: auth.bearer, auth.basic, auth.apikey
// (an array of {key, value} in v2.1, a plain object in v2.0).
interface PostmanAuth {
  type: string;
  [params: string]: unknown;
}

interface PostmanUrl {
  raw?: string;
  protocol?: string;
  host?: string[];
  port?: string;
  path?: string[];
  query?: PostmanKV[];
}

interface PostmanBody {
  mode?: string;
  raw?: string;
  formdata?: PostmanKV[];
  urlencoded?: PostmanKV[];
  options?: { raw?: { language?: string } };
}

interface PostmanItem {
  name?: string;
  description?: unknown;
  item?: PostmanItem[]; // folders contain nested items
  event?: unknown[]; // pre-request/test scripts — not imported
  request?: {
    method?: string;
    header?: PostmanKV[];
    body?: PostmanBody;
    url?: PostmanUrl | string;
    auth?: PostmanAuth;
  };
}

interface PostmanCollection {
  info: { name?: string; schema?: string; _postman_id?: string };
  item: PostmanItem[];
  variable?: PostmanKV[];
  auth?: PostmanAuth;
  event?: unknown[];
}

export interface ConversionResult {
  bucket: TestBucket;
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Detects whether a parsed JSON object is a Postman Collection, by its `info.schema` URL
 * or `info._postman_id`.
 */
export function isPostmanCollection(data: unknown): data is PostmanCollection {
  const info = (data as PostmanCollection | null)?.info;
  if (typeof info !== 'object' || info === null || Array.isArray(data)) return false;
  return /schema\.(get)?postman\.com/i.test(info.schema ?? '') || !!info._postman_id;
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

/**
 * Converts a Postman Collection into a Fortest TestBucket.
 *
 * Strategy:
 *  - Top-level folders → Action Groups
 *  - Nested subfolders → flattened into their top-level folder's group (with a warning)
 *  - Root-level requests (not in any folder) → "Ungrouped Requests" Action Group
 *  - Most common origin across requests → bucket baseUrl
 *  - Postman variables → bucket variables
 *  - Auth types mapped where supported; unsupported types produce warnings
 */
export function convertPostmanCollection(data: PostmanCollection): ConversionResult {
  const warnings: string[] = [];
  const now = new Date().toISOString();
  const baseUrl = extractCommonBaseUrl(data.item);
  const secretKeys = new Set(
    (data.variable ?? []).filter((v) => v.type === 'secret').map((v) => v.key),
  );

  const groups: Pick<ActionGroup, 'name' | 'description' | 'steps'>[] = [];
  const ungrouped: Step[] = [];
  for (const item of data.item) {
    if (isFolder(item)) {
      groups.push({
        name: item.name || 'Folder',
        description: typeof item.description === 'string' ? item.description : '',
        steps: flattenFolderToSteps(item, baseUrl, warnings, now),
      });
    } else if (item.request) {
      ungrouped.push(convertRequestToStep(item, baseUrl, warnings, now));
    }
  }
  groups.push({
    name: 'Ungrouped Requests',
    description: 'Requests that were not inside any Postman folder',
    steps: ungrouped,
  });

  if (hasEventScripts(data)) {
    warnings.push(
      'Postman test/pre-request scripts were detected but not imported. You can manually recreate assertions in the step editor.',
    );
  }

  const bucket: TestBucket = {
    id: randomUUID(),
    name: data.info.name || 'Postman Import',
    baseUrl,
    auth: convertAuth(data.auth, warnings, 'Collection'),
    variables: toKeyValues(data.variable).map((v) =>
      secretKeys.has(v.key) ? { ...v, secret: true } : v,
    ),
    environments: [],
    activeEnvironmentId: null,
    actionGroups: groups
      .filter((g) => g.steps.length > 0)
      .map((g, order) => ({
        ...g,
        id: randomUUID(),
        order,
        // Orders follow the collection's request order, including flattened subfolders.
        steps: deduplicateStepNames(g.steps).map((step, i) => ({ ...step, order: i })),
        createdAt: now,
        updatedAt: now,
      })),
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

/** Postman {key, value, disabled} lists (headers, query, variables) → Fortest key-value pairs. */
function toKeyValues(list: PostmanKV[] = []): KeyValuePair[] {
  return list
    .filter((kv) => kv.key)
    .map((kv) => ({
      id: randomUUID(),
      key: kv.key,
      value: kv.value ?? '',
      enabled: !kv.disabled,
      description: kv.description,
    }));
}

/** The most frequently used origin across all requests, nested ones included. */
function extractCommonBaseUrl(items: PostmanItem[]): string {
  const counts = new Map<string, number>();
  const visit = (list: PostmanItem[]): void => {
    for (const item of list) {
      const resolved = resolveUrl(item.request?.url);
      if (resolved.host) counts.set(originOf(resolved), (counts.get(originOf(resolved)) ?? 0) + 1);
      visit(item.item ?? []);
    }
  };
  visit(items);
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

interface ResolvedUrl {
  protocol: string;
  host: string;
  port: string;
  path: string;
  query: PostmanKV[];
}

/** Normalizes a Postman URL (string or object) into its components. */
function resolveUrl(url: PostmanUrl | string | undefined): ResolvedUrl {
  if (!url) return { protocol: 'https', host: '', port: '', path: '/', query: [] };
  if (typeof url === 'string') return parseUrlString(url);

  // Object form. A host like {{baseUrl}} usually carries its own scheme, so don't prepend one.
  const host = Array.isArray(url.host) ? url.host.join('.') : '';
  return {
    protocol: url.protocol || (host.startsWith('{{') ? '' : 'https'),
    host,
    port: url.port || '',
    path: Array.isArray(url.path) ? '/' + url.path.join('/') : '/',
    query: url.query || [],
  };
}

/** Origin of a resolved URL, e.g. `https://api.test:8080`, or `{{baseUrl}}` when the scheme lives in a variable. */
function originOf(r: ResolvedUrl): string {
  return `${r.protocol ? r.protocol + '://' : ''}${r.host}${r.port ? ':' + r.port : ''}`;
}

/** Parses a raw URL string into components. */
function parseUrlString(raw: string): ResolvedUrl {
  const result: ResolvedUrl = { protocol: 'https', host: '', port: '', path: '/', query: [] };
  const toQuery = (params: URLSearchParams, restore: (s: string) => string) =>
    [...params].map(([key, value]) => ({ key: restore(key), value: restore(value) }));

  // Swap {{variables}} for plain placeholders while parsing: `new URL` lowercases hostnames
  // and rejects braces, so names like {{Base_URL}} wouldn't survive otherwise.
  const names: string[] = [];
  const sanitized = raw.replace(
    /\{\{([^}]+)\}\}/g,
    (_m, name: string) => `pmvar${names.push(name) - 1}x`,
  );
  const restore = (str: string) =>
    str.replace(/pmvar(\d+)x/g, (_m, i: string) => `{{${names[Number(i)]}}}`);

  try {
    let urlObj: URL;
    if (/^https?:\/\//i.test(sanitized)) {
      urlObj = new URL(sanitized);
    } else if (sanitized.startsWith('//')) {
      urlObj = new URL('https:' + sanitized);
    } else {
      // Relative path, or {{baseUrl}}/path where the variable is the host (as in the object form)
      const [path = '', qs = ''] = raw.split('?');
      const varHost = path.match(/^(\{\{[^}]+\}\})(\/.*)?$/);
      if (varHost) {
        result.protocol = '';
        result.host = varHost[1]!;
      }
      result.path = (varHost ? varHost[2] : path) || '/';
      result.query = toQuery(new URLSearchParams(qs), (str) => str);
      return result;
    }

    result.protocol = urlObj.protocol.replace(':', '');
    result.host = restore(urlObj.hostname);
    result.port = urlObj.port;
    result.path = restore(urlObj.pathname || '/');
    result.query = toQuery(urlObj.searchParams, restore);
  } catch {
    // If URL parsing fails, treat the whole thing as a path
    result.path = raw;
  }

  return result;
}

/**
 * The step path: relative to the bucket baseUrl when the request shares its origin (or has none),
 * otherwise the full URL so it still works at execution time. Query params go to step params.
 */
function extractStepPath(resolved: ResolvedUrl, baseUrl: string): string {
  if (!resolved.host || originOf(resolved) === baseUrl) return resolved.path || '/';
  return originOf(resolved) + resolved.path;
}

// --- Auth Conversion ---

function convertAuth(
  auth: PostmanAuth | undefined,
  warnings: string[],
  context: string,
): AuthConfig {
  const type = auth?.type?.toLowerCase();
  if (!auth || !type || type === 'noauth') return { type: 'none' };

  // v2.1 stores params as [{key, value}], v2.0 as {key: value}.
  const raw = auth[type];
  const params = new Map<string, string>(
    Array.isArray(raw)
      ? raw.map((p: PostmanKV) => [p.key, p.value ?? ''])
      : Object.entries(raw ?? {}).map(([k, v]) => [k, typeof v === 'string' ? v : '']),
  );
  const get = (key: string) => params.get(key) ?? '';

  if (type === 'bearer') return { type: 'bearer', bearer: { token: get('token') } };
  if (type === 'basic')
    return { type: 'basic', basic: { username: get('username'), password: get('password') } };
  if (type === 'apikey') {
    return {
      type: 'api-key',
      apiKey: {
        key: get('key'),
        value: get('value'),
        addTo: get('in') === 'query' ? 'query' : 'header',
      },
    };
  }

  warnings.push(
    `${context}: Unsupported auth type "${auth.type}" was skipped. You may need to configure auth manually.`,
  );
  return { type: 'none' };
}

// --- Body Conversion ---

function convertBody(body: PostmanBody | undefined): RequestBody {
  switch (body?.mode) {
    case 'raw': {
      const lang = body.options?.raw?.language?.toLowerCase();
      return { type: lang === 'json' || lang === 'xml' ? lang : 'raw', content: body.raw || '' };
    }
    case 'formdata':
    case 'urlencoded': {
      // Stored as a JSON array of key-value pairs (see parseFormPairs)
      const entries = (body[body.mode] || [])
        .filter((f) => !f.disabled)
        .map((f) => ({ key: f.key, value: f.value || '' }));
      return {
        type: body.mode === 'formdata' ? 'form-data' : 'x-www-form-urlencoded',
        content: JSON.stringify(entries),
      };
    }
    default:
      return { type: 'none', content: '' };
  }
}

// --- Folder → Steps Flattening ---

/** Recursively flattens a folder and all its subfolders into a flat list of Steps. */
function flattenFolderToSteps(
  folder: PostmanItem,
  baseUrl: string,
  warnings: string[],
  now: string,
  parentPath = '',
): Step[] {
  return (folder.item ?? []).flatMap((item) => {
    if (isFolder(item)) {
      const path = parentPath ? `${parentPath} / ${item.name || 'Folder'}` : item.name || 'Folder';
      warnings.push(`Nested folder "${path}" was flattened into its parent Action Group.`);
      return flattenFolderToSteps(item, baseUrl, warnings, now, path);
    }
    return item.request ? [convertRequestToStep(item, baseUrl, warnings, now)] : [];
  });
}

// --- Request → Step Conversion ---

/** `order` is assigned by the caller once the group's steps are collected. */
function convertRequestToStep(
  item: PostmanItem,
  baseUrl: string,
  warnings: string[],
  now: string,
): Step {
  const req = item.request!;
  const method = HttpMethodSchema.safeParse((req.method || 'GET').toUpperCase());
  if (!method.success) {
    warnings.push(
      `Request "${item.name}": Unsupported HTTP method "${req.method}" was defaulted to GET.`,
    );
  }
  const url = resolveUrl(req.url);

  return {
    id: randomUUID(),
    name: item.name || 'Request',
    order: 0,
    method: method.success ? method.data : 'GET',
    path: extractStepPath(url, baseUrl),
    headers: toKeyValues(req.header),
    params: toKeyValues(url.query),
    body: convertBody(req.body),
    auth: convertAuth(req.auth, warnings, `Step "${item.name || 'Unnamed'}"`),
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
    nameCount.set(lowerName, count + 1);
    return count > 0 ? { ...step, name: `${step.name} (${count + 1})` } : step;
  });
}

// --- Event Script Detection ---

function hasEventScripts(node: { event?: unknown[]; item?: PostmanItem[] }): boolean {
  return !!node.event?.length || (node.item ?? []).some(hasEventScripts);
}
