// Safety net for Fortest's core logic. Run: pnpm test (or `pnpm --filter @fortest/api test`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { applyRunEvent, interpolate, parseFormPairs } from '@fortest/utils';
import {
  TestBucketSchema,
  type Assertion,
  type ExecutionRun,
  type RunEvent,
  type Step,
  type BucketVariable,
  type ProxyResponse,
  type StepResult,
  type TestBucket,
} from '@fortest/types';
import { extractValue } from './services/extractionService';
import { evaluateAssertion } from './services/assertionService';
import { isPostmanCollection, convertPostmanCollection } from './services/postmanConverter';
import {
  cancelRun,
  failOrphanedRuns,
  getGroupRuns,
  getRunById,
  getRunSummary,
  runGroup,
} from './services/runnerService';
import { computeMetrics, executeGroup, joinUrl, resolveConfig } from './services/executor';
import { getStorageAdapter } from './services/storage';
import { saveBucket, prepareImport, getBucketById } from './services/bucketService';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import * as yaml from 'yaml';

const vars = (o: Record<string, string>, disabled: string[] = []): BucketVariable[] =>
  Object.entries(o).map(([key, value]) => ({
    id: randomUUID(),
    key,
    value,
    enabled: !disabled.includes(key),
  }));

const response = (body: unknown, extra: Partial<ProxyResponse> = {}): ProxyResponse => ({
  status: 200,
  statusText: 'OK',
  headers: { 'content-type': 'application/json', 'x-request-id': 'req-1' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
  size: 0,
  time: 120,
  contentType: 'application/json',
  ...extra,
});

test('interpolate: resolves, trims, keeps unknown and disabled placeholders', () => {
  const v = vars({ host: 'api.test', 'steps.Login Step.token': 'abc', off: 'x' }, ['off']);
  const { resolved, unresolvedKeys } = interpolate(
    'https://{{host}}/{{ steps.Login Step.token }}/{{missing}}/{{off}}',
    v,
  );
  assert.equal(resolved, 'https://api.test/abc/{{missing}}/{{off}}');
  assert.deepEqual(unresolvedKeys, ['missing', 'off']);
});

test('parseFormPairs: JSON pairs, legacy query strings, malformed escapes', () => {
  const pairs = parseFormPairs(
    JSON.stringify([
      { id: 'k1', key: 'a', value: '1' },
      { key: 'b', value: 2, enabled: false },
    ]),
  );
  assert.deepEqual(
    pairs.map(({ key, value, enabled }) => [key, value, enabled]),
    [
      ['a', '1', true],
      ['b', '2', false],
    ],
  );
  assert.equal(pairs[0]!.id, 'k1');
  assert.deepEqual(
    parseFormPairs('q={{token}}&pct=100%&space=a+b').map((p) => [p.key, p.value]),
    [
      ['q', '{{token}}'],
      ['pct', '100%'],
      ['space', 'a b'],
    ],
  );
  assert.deepEqual(parseFormPairs(''), []);
});

test('extractValue: body paths, arrays, headers, status, non-JSON bodies', () => {
  const res = response({ data: { token: 't1', users: [{ id: 7 }], meta: { n: 1 }, flag: false } });
  assert.equal(extractValue(res, 'body', 'data.token'), 't1');
  assert.equal(extractValue(res, 'body', 'body.data.users[0].id'), '7');
  assert.equal(extractValue(res, 'body', 'response.body.data.meta'), '{"n":1}');
  assert.equal(extractValue(res, 'body', 'data.flag'), 'false');
  assert.equal(extractValue(res, 'body', 'data.nope.deeper'), null);
  assert.equal(extractValue(res, 'header', 'X-Request-ID'), 'req-1');
  assert.equal(extractValue(res, 'status', ''), '200');
  assert.equal(extractValue(response('plain text'), 'body', ''), 'plain text');
  assert.equal(extractValue(response('plain text'), 'body', 'data.token'), null);
});

test('evaluateAssertion: every operator, including missing values and bad regexes', () => {
  const res = response({ user: { role: 'dev', age: 30, active: true, tags: ['a', 'b'] } });
  const check = (
    target: Assertion['target'],
    selector: string,
    operator: Assertion['operator'],
    expected: string,
  ) => evaluateAssertion(res, { id: randomUUID(), target, selector, operator, expected }).passed;

  assert.equal(check('status', '', 'equals', '200'), true);
  assert.equal(check('status', '', 'not_equals', '201'), true);
  assert.equal(check('body', 'user.age', 'equals', '30'), true);
  assert.equal(check('body', 'user.active', 'equals', 'true'), true);
  assert.equal(check('body', 'user.tags', 'contains', '"b"'), true);
  assert.equal(check('body', 'user.role', 'not_contains', 'admin'), true);
  assert.equal(check('body', 'user.missing', 'not_contains', 'x'), true);
  assert.equal(check('body', 'user.age', 'greater_than', '18'), true);
  assert.equal(check('response_time', '', 'less_than', '500'), true);
  assert.equal(check('body', 'user.role', 'exists', ''), true);
  assert.equal(check('body', 'user.missing', 'not_exists', ''), true);
  assert.equal(check('header', 'Content-Type', 'matches_regex', '^application/json'), true);

  assert.equal(check('body', 'user.missing', 'equals', 'undefined'), false);
  assert.equal(check('body', 'user.missing', 'greater_than', '0'), false);
  const bad = evaluateAssertion(res, {
    id: randomUUID(),
    target: 'status',
    selector: '',
    operator: 'matches_regex',
    expected: '(',
  });
  assert.equal(bad.passed, false);
  assert.match(bad.message, /Error during evaluation/);
});

test('computeMetrics: failures, nearest-rank percentiles, throughput', () => {
  const r = (status: number, responseTime: number, extra: Partial<StepResult> = {}) =>
    ({ status, responseTime, responseSize: 10, assertions: [], ...extra }) as unknown as StepResult;
  const results = [
    r(200, 10),
    r(200, 20),
    r(404, 30),
    r(0, 40, { error: 'ECONNREFUSED' }),
    r(200, 50, { assertions: [{ passed: false }] as StepResult['assertions'] }),
  ];
  const m = computeMetrics(results, 2000);
  assert.deepEqual(
    { total: m.totalRequests, ok: m.completed, failed: m.failed, errorRate: m.errorRate },
    { total: 5, ok: 2, failed: 3, errorRate: 60 },
  );
  assert.deepEqual(
    [m.minLatency, m.maxLatency, m.avgLatency, m.p50, m.p95, m.p99],
    [10, 50, 30, 30, 50, 50],
  );
  assert.equal(m.throughputPerSec, 2.5);
  assert.equal(m.totalDataTransferred, 50);
  assert.equal(computeMetrics([], 0).p95, 0);
});

test('joinUrl: base + relative path, absolute paths win', () => {
  assert.equal(joinUrl('https://api.test', '/users'), 'https://api.test/users');
  assert.equal(joinUrl('https://api.test/', 'users'), 'https://api.test/users');
  assert.equal(joinUrl('https://api.test', 'users'), 'https://api.test/users');
  assert.equal(joinUrl('', '/users'), '/users');
  assert.equal(joinUrl('https://api.test', 'https://other.test/x'), 'https://other.test/x');
});

test('Postman import: realistic v2.1 collection maps to a valid, runnable bucket', () => {
  const collection = {
    info: {
      name: 'Shop API',
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    variable: [{ key: 'baseUrl', value: 'https://api.shop.test' }],
    auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{token}}', type: 'string' }] },
    item: [
      {
        name: 'Users',
        item: [
          {
            name: 'List users',
            request: {
              method: 'GET',
              url: {
                raw: '{{baseUrl}}/users?page=2',
                host: ['{{baseUrl}}'],
                path: ['users'],
                query: [{ key: 'page', value: '2' }],
              },
            },
          },
          {
            name: 'Create user',
            event: [{ listen: 'test', script: { exec: ['pm.test("ok", () => {})'] } }],
            request: {
              method: 'POST',
              url: { raw: '{{baseUrl}}/users', host: ['{{baseUrl}}'], path: ['users'] },
              auth: { type: 'apikey', apikey: { key: 'X-Key', value: '{{apiKey}}', in: 'query' } }, // v2.0 object form
              body: {
                mode: 'urlencoded',
                urlencoded: [
                  { key: 'name', value: 'Ada' },
                  { key: 'x', value: '1', disabled: true },
                ],
              },
            },
          },
          {
            name: 'Admin',
            item: [
              {
                name: 'List users',
                request: {
                  method: 'GET',
                  url: '{{baseUrl}}/admin/users',
                  auth: { type: 'oauth2' },
                },
              },
            ],
          },
        ],
      },
      {
        name: 'Health',
        request: { method: 'GET', url: 'https://{{status_host}}/health?verbose=true' },
      },
    ],
  };

  assert.equal(isPostmanCollection(collection), true);
  assert.equal(isPostmanCollection({ name: 'Fortest bucket', actionGroups: [] }), false);

  const { bucket, warnings } = convertPostmanCollection(collection as never);
  TestBucketSchema.parse(bucket); // the import route rejects anything that fails this

  assert.deepEqual(bucket.auth, { type: 'bearer', bearer: { token: '{{token}}' } });
  assert.deepEqual(
    bucket.actionGroups.map((g) => g.name),
    ['Users', 'Ungrouped Requests'],
  );
  assert.ok(
    warnings.some((w) => /nested/i.test(w)),
    'warns about flattened nested folders',
  );
  assert.ok(
    warnings.some((w) => /script/i.test(w)),
    'warns about skipped scripts',
  );
  assert.ok(
    warnings.some((w) => /Unsupported auth type "oauth2"/.test(w)),
    'warns about unsupported auth',
  );

  // What the runner will actually call, once variables are filled in.
  const env = vars({ baseUrl: 'https://api.shop.test', status_host: 'status.shop.test' });
  const urlOf = (groupName: string, stepName: string) => {
    const step = bucket.actionGroups
      .find((g) => g.name === groupName)!
      .steps.find((s) => s.name === stepName)!;
    const query = step.params
      .filter((p) => p.enabled)
      .map((p) => `${p.key}=${p.value}`)
      .join('&');
    const url = joinUrl(
      interpolate(bucket.baseUrl, env).resolved,
      interpolate(step.path, env).resolved,
    );
    return query ? `${url}?${query}` : url;
  };

  const users = bucket.actionGroups[0]!.steps;
  assert.equal(new Set(users.map((s) => s.name)).size, users.length, 'step names are unique');
  assert.equal(urlOf('Users', 'List users'), 'https://api.shop.test/users?page=2');
  assert.equal(urlOf('Users', 'Create user'), 'https://api.shop.test/users');
  assert.deepEqual(
    users.map((s) => [s.order, s.path]),
    [
      [0, '/users'],
      [1, '/users'],
      [2, '/admin/users'],
    ],
    'nested request flattened in, ordered after its siblings',
  );
  assert.equal(
    urlOf('Ungrouped Requests', 'Health'),
    'https://status.shop.test/health?verbose=true',
  );

  const create = users.find((s) => s.name === 'Create user')!;
  assert.deepEqual(create.auth, {
    type: 'api-key',
    apiKey: { key: 'X-Key', value: '{{apiKey}}', addTo: 'query' },
  });
  assert.equal(create.body.type, 'x-www-form-urlencoded');
  assert.deepEqual(
    parseFormPairs(create.body.content).map((p) => [p.key, p.value]),
    [['name', 'Ada']],
  );
});

test('bucket file import: README templates import cleanly, with fresh ids; junk is rejected', () => {
  // The templates users copy from the README must always import.
  const readme = readFileSync(new URL('../../../README.md', import.meta.url), 'utf8');
  const block = (heading: string, lang: string) =>
    readme.split(heading)[1]!.match(new RegExp('```' + lang + '\\n([\\s\\S]*?)```'))![1]!;
  const [fromJson, fromYaml] = [
    JSON.parse(block('#### JSON Template', 'json')),
    yaml.parse(block('#### YAML Template', 'yaml')),
  ].map(prepareImport);
  assert.equal(fromJson!.actionGroups[0]!.steps[1]!.assertions[1]!.expected, '{{defaultRole}}');
  assert.equal(fromYaml!.actionGroups[0]!.steps.length, 2);

  // So must the templates offered in the app's import dialog.
  const webTemplate = (ext: string) =>
    readFileSync(
      new URL(`../../web/src/templates/fortest-template.${ext}`, import.meta.url),
      'utf8',
    );
  prepareImport(JSON.parse(webTemplate('json')));
  prepareImport(yaml.parse(webTemplate('yaml')));

  const exported = TestBucketSchema.parse(fromJson);
  const reimported = prepareImport(exported);
  assert.notEqual(reimported.id, exported.id);
  assert.notEqual(reimported.actionGroups[0]!.steps[0]!.id, exported.actionGroups[0]!.steps[0]!.id);
  assert.equal(reimported.actionGroups[0]!.steps[0]!.name, 'Login Step');

  assert.throws(() => prepareImport({}), /Not a Fortest bucket file/);
  assert.throws(() => prepareImport({ name: 'x', surprise: true }), /Unrecognized key/);
  assert.throws(() => prepareImport('just a string'));
});

test('runGroup: chains an extracted token across steps, one isolated context per data-store record', async (t) => {
  // Target API: POST /login {user} -> {data:{token}}; GET /me needs "Bearer tok-<user>".
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      if (req.method === 'POST' && req.url === '/login') {
        res.end(JSON.stringify({ data: { token: `tok-${JSON.parse(body).user}` } }));
      } else if (
        req.url?.startsWith('/me?who=') &&
        /^Bearer tok-(ada|bob)$/.test(req.headers.authorization ?? '')
      ) {
        res.end(
          JSON.stringify({
            user: { name: req.headers.authorization!.slice(11), role: 'developer' },
          }),
        );
      } else {
        res.statusCode = 401;
        res.end('{}');
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());

  const now = new Date().toISOString();
  const groupId = randomUUID();
  const bucket: TestBucket = TestBucketSchema.parse({
    id: randomUUID(),
    name: 'e2e',
    baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    variables: vars({ defaultRole: 'developer' }),
    createdAt: now,
    updatedAt: now,
    actionGroups: [
      {
        id: groupId,
        name: 'Auth flow',
        order: 0,
        createdAt: now,
        updatedAt: now,
        dataStore: {
          id: randomUUID(),
          name: 'users',
          records: [{ testUser: 'ada' }, { testUser: 'bob' }],
          createdAt: now,
        },
        steps: [
          {
            id: randomUUID(),
            name: 'Login Step',
            order: 0,
            method: 'POST',
            path: '/login',
            body: { type: 'json', content: '{"user":"{{testUser}}"}' },
            extractions: [
              {
                id: randomUUID(),
                variableName: 'authToken',
                source: 'body',
                selector: 'data.token',
              },
              { id: randomUUID(), variableName: 'code', source: 'status' }, // status needs no selector
            ],
            createdAt: now,
            updatedAt: now,
          },
          {
            id: randomUUID(),
            name: 'Get Profile',
            order: 1,
            path: '/me',
            body: { type: 'json', content: '{"ignored":true}' }, // GET with a body must not fail
            params: [
              { id: randomUUID(), key: 'who', value: '{{testUser}}', enabled: true },
              { id: randomUUID(), key: 'off', value: '1', enabled: false },
            ],
            auth: { type: 'bearer', bearer: { token: '{{steps.Login Step.authToken}}' } },
            assertions: [
              { id: randomUUID(), target: 'status', operator: 'equals', expected: '200' },
              {
                id: randomUUID(),
                target: 'body',
                selector: 'user.name',
                operator: 'equals',
                expected: '{{testUser}}',
              },
              {
                id: randomUUID(),
                target: 'body',
                selector: 'user.role',
                operator: 'equals',
                expected: '{{defaultRole}}',
              },
            ],
            createdAt: now,
            updatedAt: now,
          },
        ],
      },
    ],
  });
  await saveBucket(bucket); // no Redis connected in tests -> in-memory storage

  const runId = randomUUID();
  const events: string[] = [];
  await runGroup(
    bucket.id,
    groupId,
    runId,
    { iterations: 2, concurrency: 2, useDataStore: true },
    (e) => events.push(e.type),
  );

  const run = (await getRunById(runId))!;
  const failures = run.results.flatMap((r) =>
    [r.error, ...r.assertions.filter((a) => !a.passed).map((a) => a.message)].filter(Boolean),
  );
  assert.deepEqual(failures, []);
  assert.equal(run.status, 'completed');
  assert.equal(run.config.mode, 'load');
  assert.equal(run.results.length, 4);
  assert.deepEqual(run.metrics && [run.metrics.totalRequests, run.metrics.failed], [4, 0]);
  // Iteration 1 keeps its bodies (data-store record 1 = ada); iteration 2's passing results don't.
  const logins = run.results.filter((r) => r.stepName === 'Login Step');
  assert.equal(logins.find((r) => r.iteration === 1)?.requestBody, '{"user":"ada"}');
  assert.equal(logins.find((r) => r.iteration === 2)?.bodyOmitted, true);
  assert.deepEqual(
    run.results
      .filter((r) => r.stepName === 'Get Profile')
      .map((r) => new URL(r.url).search)
      .sort(),
    ['?who=ada', '?who=bob'],
  );
  assert.ok(
    run.results
      .filter((r) => r.stepName === 'Login Step')
      .every((r) => r.extractedData['code'] === '200'),
  );
  assert.equal(events[0], 'run:started');
  assert.equal(events.at(-1), 'run:finished');
  assert.equal(events.filter((e) => e === 'step:finished').length, 4);
});

// --- Run storage, body retention, cancellation ---

/** A local API for run tests: /ok, /fail (500) and /slow (200 ms). */
async function startTarget(t: { after: (fn: () => void) => void }): Promise<string> {
  const server = http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/fail') {
      res.statusCode = 500;
      res.end('{"error":"boom"}');
    } else if (req.url === '/slow') {
      setTimeout(() => res.end('{"slow":true}'), 200);
    } else {
      res.end('{"ok":true}');
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

/** Saves a one-group bucket whose steps GET the given paths; returns ids for runGroup. */
async function saveFlow(baseUrl: string, paths: string[]) {
  const now = new Date().toISOString();
  const groupId = randomUUID();
  const steps: Partial<Step>[] = paths.map((path, order) => ({
    id: randomUUID(),
    name: `GET ${path}`,
    order,
    path,
    createdAt: now,
    updatedAt: now,
  }));
  const bucket = TestBucketSchema.parse({
    id: randomUUID(),
    name: 'runs',
    baseUrl,
    createdAt: now,
    updatedAt: now,
    actionGroups: [{ id: groupId, name: 'g', order: 0, steps, createdAt: now, updatedAt: now }],
  });
  await saveBucket(bucket);
  return { bucketId: bucket.id, groupId };
}

test('runs: summary + appended results; load runs keep bodies for iteration 1 and failures only', async (t) => {
  const { bucketId, groupId } = await saveFlow(await startTarget(t), ['/ok', '/fail']);
  const runId = randomUUID();
  await runGroup(bucketId, groupId, runId, { iterations: 3 }, () => {});

  const stored = JSON.parse((await getStorageAdapter().get(`run:${runId}`))!);
  assert.equal('results' in stored, false, 'summary key holds no results');
  assert.equal(stored.status, 'completed');

  const run = (await getRunById(runId))!;
  assert.equal(run.results.length, 6);
  assert.deepEqual([run.metrics?.totalRequests, run.metrics?.failed], [6, 3]);
  for (const r of run.results) {
    if (r.stepName === 'GET /fail')
      assert.equal(r.responseBody, '{"error":"boom"}', 'failures keep bodies');
    else if (r.iteration === 1)
      assert.equal(r.responseBody, '{"ok":true}', 'iteration 1 keeps bodies');
    else
      assert.deepEqual(
        [r.responseBody, r.bodyOmitted, r.status],
        ['', true, 200],
        'later passing results drop bodies',
      );
  }

  const history = await getGroupRuns(groupId);
  assert.deepEqual(
    history.map((h) => h.id),
    [runId],
  );
  assert.equal('results' in history[0]!, false);
});

test('runs: cancelling stops a run between steps and records it as cancelled', async (t) => {
  const { bucketId, groupId } = await saveFlow(await startTarget(t), ['/slow']);
  const runId = randomUUID();
  const events: RunEvent[] = [];
  const running = runGroup(bucketId, groupId, runId, { iterations: 50 }, (e) => events.push(e));
  await new Promise((r) => setTimeout(r, 450));
  assert.equal(cancelRun(runId), true);
  await running;

  const run = (await getRunById(runId))!;
  assert.equal(run.status, 'cancelled');
  assert.equal(run.error, 'Cancelled by user');
  assert.ok(run.results.length > 0 && run.results.length < 50, `${run.results.length} results`);
  assert.ok(
    run.results.every((r) => !r.error),
    'the request in flight when cancelled is not recorded as a failure',
  );
  assert.equal(cancelRun(runId), false, 'nothing to cancel once finished');
  assert.equal(events.at(-1)?.type, 'run:finished');
});

test('runs: startup marks runs orphaned by a restart as failed; legacy inline results still load', async () => {
  const adapter = getStorageAdapter();
  const now = new Date().toISOString();
  const base = {
    bucketId: randomUUID(),
    actionGroupId: randomUUID(),
    actionGroupName: 'g',
    createdAt: now,
    config: {
      mode: 'manual',
      iterations: 1,
      concurrency: 1,
      delayBetweenSteps: 0,
      useDataStore: false,
    },
  };

  const orphanId = randomUUID();
  await adapter.set(
    `run:${orphanId}`,
    JSON.stringify({ ...base, id: orphanId, status: 'running' }),
  );
  await adapter.sadd('runs:active', orphanId);
  await failOrphanedRuns();
  const orphan = (await getRunSummary(orphanId))!;
  assert.equal(orphan.status, 'failed');
  assert.match(orphan.error ?? '', /Interrupted/);
  assert.deepEqual(await adapter.smembers('runs:active'), []);

  const legacyId = randomUUID();
  const legacyResult = { stepId: randomUUID(), stepName: 's', iteration: 1, status: 200 };
  await adapter.set(
    `run:${legacyId}`,
    JSON.stringify({ ...base, id: legacyId, status: 'completed', results: [legacyResult] }),
  );
  assert.deepEqual((await getRunById(legacyId))!.results, [legacyResult]);
  assert.equal('results' in (await getRunSummary(legacyId))!, false);
});

test('applyRunEvent: events and snapshot merge in any order without losing results or status', () => {
  const runId = randomUUID();
  const [a, b] = [randomUUID(), randomUUID()];
  const result = (stepId: string, status = 200) =>
    ({
      stepId,
      stepName: stepId,
      iteration: 1,
      status,
      statusText: 'OK',
      assertions: [],
    }) as unknown as ExecutionRun['results'][number];
  const start = { id: runId, status: 'running', results: [] } as unknown as ExecutionRun;
  const apply = (run: ExecutionRun | null, ...events: RunEvent[]) =>
    events.reduce(applyRunEvent, run);

  let run = apply(
    start,
    { type: 'step:started', runId, stepId: a, stepName: 'a', iteration: 1, method: 'GET' },
    { type: 'step:finished', runId, result: result(a) },
    { type: 'step:started', runId, stepId: a, stepName: 'a', iteration: 1, method: 'GET' }, // late duplicate
  )!;
  assert.deepEqual(
    run.results.map((r) => r.statusText),
    ['OK'],
    'a placeholder never replaces a finished result',
  );

  run = apply(
    run,
    { type: 'run:finished', runId, run: { ...start, status: 'completed' } },
    {
      type: 'run:snapshot',
      runId,
      run: { ...start, status: 'running', results: [result(a), result(b, 500)] },
    }, // stale snapshot
  )!;
  assert.equal(run.status, 'completed', 'a stale snapshot never undoes a finished status');
  assert.deepEqual(
    run.results.map((r) => r.stepId),
    [a, b],
    'snapshot results are merged in',
  );

  assert.equal(apply(null, { type: 'run:snapshot', runId, run: start })?.id, runId);
  assert.equal(apply(null, { type: 'step:finished', runId, result: result(a) }), null);
});

// --- CLI (run as a real subprocess, like CI would) ---

const execFileAsync = promisify(execFile);
const CLI = fileURLToPath(new URL('./cli.ts', import.meta.url));

/** Runs `fortest <args>`; resolves with the exit code instead of throwing on failure. */
async function fortest(...args: string[]) {
  try {
    const { stdout } = await execFileAsync(process.execPath, ['--import', 'tsx', CLI, ...args], {
      cwd: fileURLToPath(new URL('..', import.meta.url)), // apps/api, where tsx resolves
      env: { ...process.env, NO_COLOR: '1', INIT_CWD: '' },
    });
    return { code: 0, out: stdout };
  } catch (err) {
    const e = err as { code: number; stdout: string; stderr: string };
    return { code: e.code, out: e.stdout + e.stderr };
  }
}

test('CLI: exit codes, --var overrides, and a JUnit report CI can read', async (t) => {
  const baseUrl = await startTarget(t);
  const dir = mkdtempSync(join(tmpdir(), 'fortest-cli-'));
  t.after(() => rmSync(dir, { recursive: true }));
  const file = join(dir, 'bucket.yaml');
  writeFileSync(
    file,
    yaml.stringify({
      name: 'CLI Bucket',
      baseUrl,
      variables: [{ key: 'expected', value: '200' }],
      actionGroups: [
        {
          name: 'Smoke',
          steps: [
            {
              name: 'OK',
              path: '/ok',
              assertions: [{ target: 'status', operator: 'equals', expected: '{{expected}}' }],
            },
          ],
        },
        {
          name: 'Broken',
          steps: [
            { name: 'Fails', path: '/fail' },
            { name: 'Unreachable host', path: 'http://127.0.0.1:1/nope' }, // network error ends the iteration
            { name: 'Never runs', path: '/ok' },
          ],
        },
      ],
    }),
  );

  const pass = await fortest('run', file, '--group', 'smoke');
  assert.equal(pass.code, 0, pass.out);
  assert.match(pass.out, /✓ OK/);
  assert.match(pass.out, /All 1 action group\(s\) passed/);

  const overridden = await fortest('run', file, '-g', 'Smoke', '--var', 'expected=201');
  assert.equal(overridden.code, 1, 'a --var override reaches assertions');
  assert.match(overridden.out, /Expected "201" but got "200"/);

  const report = join(dir, 'junit.xml');
  const all = await fortest('run', file, '--junit', report);
  assert.equal(all.code, 1);
  assert.match(all.out, /1 of 2 action group\(s\) failed/);
  const xmlReport = readFileSync(report, 'utf8');
  assert.match(xmlReport, /<testsuites name="fortest" tests="4" failures="2">/);
  assert.match(xmlReport, /name="Fails"[^>]*><failure message="HTTP 500 Internal Server Error">/);
  assert.match(
    xmlReport,
    /name="Never runs"[^>]*><skipped message="not reached: an earlier step failed"\/>/,
  );

  assert.equal((await fortest('run', join(dir, 'missing.yaml'))).code, 2);
  assert.equal((await fortest('run', file, '--iterations', '0')).code, 2);
  assert.equal((await fortest('run', file, '--group', 'Nope')).code, 2);
  assert.equal((await fortest('bogus')).code, 2);
});

// --- Environments ---

test('environments: override order is bucket < environment < data-store record < --var', async (t) => {
  const baseUrl = await startTarget(t);
  const now = new Date().toISOString();
  const env = { id: randomUUID(), name: 'staging', variables: vars({ path: 'ok' }) };
  const bucket = TestBucketSchema.parse({
    id: randomUUID(),
    name: 'envs',
    baseUrl,
    createdAt: now,
    updatedAt: now,
    variables: vars({ path: 'fail' }), // shared default: hits /fail
    environments: [env],
    activeEnvironmentId: env.id,
    actionGroups: [
      {
        id: randomUUID(),
        name: 'g',
        order: 0,
        createdAt: now,
        updatedAt: now,
        dataStore: { id: randomUUID(), name: 'd', records: [{ path: 'fail' }], createdAt: now },
        steps: [
          {
            id: randomUUID(),
            name: 'hit',
            order: 0,
            path: '/{{path}}',
            createdAt: now,
            updatedAt: now,
          },
        ],
      },
    ],
  });
  const group = bucket.actionGroups[0]!;
  const statusOf = async (
    opts: Partial<Parameters<typeof executeGroup>[2]>,
    useDataStore = false,
  ) => {
    let status = -1;
    await executeGroup(bucket, group, {
      runId: randomUUID(),
      config: resolveConfig({ useDataStore }),
      signal: new AbortController().signal,
      emit: () => {},
      onResult: (r) => void (status = r.status),
      ...opts,
    });
    return status;
  };

  assert.equal(
    await statusOf({}),
    200,
    "the bucket's active environment overrides bucket variables",
  );
  assert.equal(await statusOf({ environmentId: null }), 500, 'no environment: bucket variables');
  assert.equal(await statusOf({}, true), 500, 'a data-store record overrides the environment');
  assert.equal(
    await statusOf({ overrides: vars({ path: 'ok' }) }, true),
    200,
    'overrides (--var) beat everything',
  );

  await saveBucket(bucket);
  const runId = randomUUID();
  await runGroup(bucket.id, group.id, runId, {}, () => {});
  assert.equal(
    (await getRunSummary(runId))?.environmentName,
    'staging',
    'runs record their environment',
  );
});

test('environments: imports re-point the active environment, by id or (hand-written) by name', () => {
  const file = (active: string | null) => ({
    name: 'b',
    environments: [
      { id: randomUUID(), name: 'local' },
      { name: 'staging', variables: [{ key: 'host', value: 's.test' }] },
    ],
    activeEnvironmentId: active,
  });
  const byName = prepareImport(file('staging'));
  assert.equal(byName.activeEnvironmentId, byName.environments[1]!.id);
  assert.equal(byName.environments[1]!.variables[0]!.value, 's.test');

  const exported = file(null);
  exported.activeEnvironmentId = exported.environments[0]!.id!;
  const byId = prepareImport(exported);
  assert.notEqual(byId.environments[0]!.id, exported.environments[0]!.id, 'fresh ids');
  assert.equal(byId.activeEnvironmentId, byId.environments[0]!.id, 'still pointing at "local"');

  assert.equal(prepareImport(file('nope')).activeEnvironmentId, null);
  assert.equal(
    prepareImport({ name: 'old export' }).environments.length,
    0,
    'files from before environments still import',
  );
});

test('CLI: --env picks an environment by name; "none" and unknown names', async (t) => {
  const baseUrl = await startTarget(t);
  const dir = mkdtempSync(join(tmpdir(), 'fortest-env-'));
  t.after(() => rmSync(dir, { recursive: true }));
  const file = join(dir, 'b.yaml');
  writeFileSync(
    file,
    yaml.stringify({
      name: 'Env Bucket',
      baseUrl,
      variables: [{ key: 'path', value: 'fail' }],
      environments: [{ name: 'Staging', variables: [{ key: 'path', value: 'ok' }] }],
      activeEnvironmentId: 'Staging',
      actionGroups: [{ name: 'g', steps: [{ name: 'hit', path: '/{{path}}' }] }],
    }),
  );

  const byDefault = await fortest('run', file);
  assert.equal(byDefault.code, 0, byDefault.out);
  assert.match(byDefault.out, /Env Bucket · Staging/);
  assert.equal((await fortest('run', file, '--env', 'staging')).code, 0);
  assert.equal(
    (await fortest('run', file, '--env', 'none')).code,
    1,
    'none: bucket variables hit /fail',
  );
  const unknown = await fortest('run', file, '-e', 'prod');
  assert.equal(unknown.code, 2);
  assert.match(unknown.out, /No environment "prod" in Env Bucket \(has: Staging\)/);
});

test('environments: buckets stored before environments existed load with defaults', async () => {
  const id = randomUUID();
  const now = new Date().toISOString();
  const legacy = {
    id,
    name: 'legacy',
    baseUrl: '',
    auth: { type: 'none' },
    variables: [],
    actionGroups: [],
    createdAt: now,
    updatedAt: now,
  };
  await getStorageAdapter().set(`bucket:${id}`, JSON.stringify(legacy));
  const bucket = (await getBucketById(id))!;
  assert.deepEqual([bucket.environments, bucket.activeEnvironmentId], [[], null]);
});
