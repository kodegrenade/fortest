// Safety net for Fortest's core logic. Run: pnpm test (or `pnpm --filter @fortest/api test`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { interpolate, parseFormPairs } from '@fortest/utils';
import {
  TestBucketSchema,
  type Assertion,
  type BucketVariable,
  type ProxyResponse,
  type StepResult,
  type TestBucket,
} from '@fortest/types';
import { extractValue } from './services/extractionService';
import { evaluateAssertion } from './services/assertionService';
import { isPostmanCollection, convertPostmanCollection } from './services/postmanConverter';
import { computeMetrics, joinUrl, runGroup, getRunById } from './services/runnerService';
import { saveBucket, prepareImport } from './services/bucketService';
import { readFileSync } from 'node:fs';
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
  assert.deepEqual(
    run.results
      .filter((r) => r.stepName === 'Login Step')
      .map((r) => r.requestBody)
      .sort(),
    ['{"user":"ada"}', '{"user":"bob"}'],
  );
  assert.deepEqual(
    run.results
      .filter((r) => r.stepName === 'Get Profile')
      .map((r) => new URL(r.url).search)
      .sort(),
    ['?who=ada', '?who=bob'],
  );
  assert.ok(run.results.filter((r) => r.stepName === 'Login Step').every((r) => r.extractedData['code'] === '200'));
  assert.equal(events[0], 'run:started');
  assert.equal(events.at(-1), 'run:completed');
  assert.equal(events.filter((e) => e === 'step:completed').length, 4);
});
