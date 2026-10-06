// The last check before publishing: packs dist/ exactly as npm would publish it, installs the
// tarball into an empty project, and runs the installed `fortest` against a local server.
// Usage: node scripts/smoke-test.mjs   (after `node build.mjs`)
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const dist = resolve('dist');
const { name, version } = JSON.parse(readFileSync(join(dist, 'package.json'), 'utf8'));
const work = mkdtempSync(join(tmpdir(), 'fortest-smoke-'));
let failed = false;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail && !ok ? ` — ${detail}` : ''}`);
  if (!ok) failed = true;
};

const server = http.createServer((req, res) => {
  res.statusCode = req.url === '/fail' ? 500 : 200;
  res.end('{}');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const baseUrl = `http://127.0.0.1:${server.address().port}`;

try {
  // 1. Pack, as `npm publish dist` would.
  const [packed] = JSON.parse(
    (await exec('npm', ['pack', dist, '--pack-destination', work, '--json'])).stdout,
  );
  const files = packed.files.map((f) => f.path).sort();
  const expected = [
    'LICENSE',
    'README.md',
    'THIRD-PARTY-NOTICES.txt',
    'fortest.cjs',
    'package.json',
  ];
  check(
    'tarball contains exactly the expected files',
    JSON.stringify(files) === JSON.stringify(expected),
    files.join(', '),
  );
  check(`tarball is ${name}@${version}`, packed.name === name && packed.version === version);

  // 2. Install into an empty project.
  writeFileSync(join(work, 'package.json'), '{ "private": true }');
  await exec('npm', ['install', join(work, packed.filename), '--no-audit', '--no-fund'], {
    cwd: work,
  });
  const fortest = join(work, 'node_modules', '.bin', 'fortest');
  const run = async (...args) => {
    try {
      const { stdout } = await exec(fortest, args, {
        cwd: work,
        env: { ...process.env, NO_COLOR: '1' },
      });
      return { code: 0, out: stdout };
    } catch (err) {
      return { code: err.code, out: `${err.stdout}${err.stderr}` };
    }
  };

  // 3. Use it.
  writeFileSync(
    join(work, 'bucket.yaml'),
    [
      'formatVersion: 1',
      'name: Smoke',
      `baseUrl: ${baseUrl}`,
      'actionGroups:',
      '  - name: Passing',
      '    steps: [{ name: ok, path: /ok, assertions: [{ target: status, operator: equals, expected: "200" }] }]',
      '  - name: Failing',
      '    steps: [{ name: fails, path: /fail }]',
    ].join('\n'),
  );
  check('fortest --version', (await run('--version')).out.trim() === version);
  const pass = await run('run', 'bucket.yaml', '--group', 'Passing', '--junit', 'report.xml');
  check('passing run exits 0', pass.code === 0, pass.out);
  check(
    'JUnit report written',
    readFileSync(join(work, 'report.xml'), 'utf8').includes('<testsuites name="fortest"'),
  );
  check('failing run exits 1', (await run('run', 'bucket.yaml')).code === 1);
  check('bad input exits 2', (await run('run', 'missing.yaml')).code === 2);
  // As a project dependency: an npm script run from a subfolder resolves paths from the project root.
  writeFileSync(
    join(work, 'package.json'),
    JSON.stringify({
      private: true,
      scripts: { 'test:api': 'fortest run bucket.yaml --group Passing' },
    }),
  );
  mkdirSync(join(work, 'sub'));
  const script = await exec('npm', ['run', '-s', 'test:api'], { cwd: join(work, 'sub') }).then(
    () => 0,
    (err) => `${err.code}: ${err.stdout}${err.stderr}`,
  );
  check('npm script run from a subfolder finds its files', script === 0, String(script));

  const serve = await run('serve');
  check(
    'serve points to the Docker image',
    serve.code === 2 && serve.out.includes('ghcr.io/kodegrenade/fortest'),
    serve.out,
  );
} finally {
  server.close();
  rmSync(work, { recursive: true, force: true });
}

if (failed) {
  console.error('\nPackage smoke test failed.');
  process.exit(1);
}
console.log(`\n${name}@${version} works when installed from its tarball.`);
