// Fortest CLI: run exported bucket files or Postman collections from a terminal or CI, or start the server.
// Exit codes: 0 all passed, 1 a step or assertion failed, 2 bad input, 130 interrupted.
import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import * as yaml from 'yaml';
import {
  ExecutionConfigSchema,
  TestBucketSchema,
  type ActionGroup,
  type StepResult,
  type TestBucket,
} from '@fortest/types';
import { activeEnvironment, isFailedResult } from '@fortest/utils';
import { prepareImport } from './services/bucketService';
import { isPostmanCollection, convertPostmanCollection } from './services/postmanConverter';
import { executeGroup, resolveConfig, type ExecuteOutcome } from './services/executor';

const USAGE = `Usage:
  fortest run <file> [options]   Run the action groups in a bucket file (JSON/YAML export or Postman collection)
  fortest serve                  Start the Fortest web app and API

Options for run:
  -g, --group <name>       Only run this action group (repeatable; default: all)
  -e, --env <name>         Use this environment (default: the bucket's selected one; "none" for none)
  -v, --var <KEY=VALUE>    Set or override a variable (repeatable; beats everything), e.g. --var token=$API_TOKEN
  --iterations <n>         Iterations per action group (default 1; more makes it a load run)
  --concurrency <n>        Iterations run in parallel (default 1)
  --delay <ms>             Delay between steps (default 0)
  --junit <path>           Also write a JUnit XML report (for CI test summaries)
  -h, --help               Show this help`;

class UsageError extends Error {}

/** Readable error text (Zod errors become one line per issue). */
const messageOf = (err: unknown): string =>
  err instanceof Error && 'errors' in err && Array.isArray(err.errors)
    ? err.errors
        .map(
          (e: { path: (string | number)[]; message: string }) =>
            (e.path.length ? `${e.path.join('.')}: ` : '') + e.message,
        )
        .join('\n')
    : err instanceof Error
      ? err.message
      : String(err);

// Paths are relative to where the user ran the command (pnpm runs scripts from the repo root).
const fromCwd = (path: string) => resolve(process.env['INIT_CWD'] ?? process.cwd(), path);

const useColor = process.stdout.isTTY && !process.env['NO_COLOR'];
const paint = (code: number) => (text: string) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text);
const [green, red, yellow, dim, bold] = [32, 31, 33, 2, 1].map(paint) as [
  (t: string) => string,
  (t: string) => string,
  (t: string) => string,
  (t: string) => string,
  (t: string) => string,
];

function loadBuckets(file: string): TestBucket[] {
  let parsed: unknown;
  try {
    parsed = yaml.parse(readFileSync(fromCwd(file), 'utf8')); // YAML is a superset of JSON
  } catch (err) {
    throw new UsageError(`Cannot read ${file}: ${messageOf(err)}`);
  }
  if (isPostmanCollection(parsed)) {
    const { bucket, warnings } = convertPostmanCollection(parsed);
    for (const warning of warnings) console.warn(yellow(`warning: ${warning}`));
    return [TestBucketSchema.parse(bucket)];
  }
  try {
    return (Array.isArray(parsed) ? parsed : [parsed]).map(prepareImport);
  } catch (err) {
    throw new UsageError(`${file} is not a valid Fortest bucket file:\n${messageOf(err)}`);
  }
}

/** --env by name (case-insensitive); "none" for no environment; default the bucket's selected one. */
function pickEnvironment(bucket: TestBucket, name: string | undefined) {
  if (name === undefined) return activeEnvironment(bucket);
  if (name.toLowerCase() === 'none') return undefined;
  const env = bucket.environments.find((e) => e.name.toLowerCase() === name.toLowerCase());
  if (!env) {
    const names = bucket.environments.map((e) => e.name);
    throw new UsageError(
      `No environment "${name}" in ${bucket.name}${names.length ? ` (has: ${names.join(', ')})` : ' (it has none)'}.`,
    );
  }
  return env;
}

/** Why a result failed, as short lines. */
function failureReasons(r: StepResult): string[] {
  if (r.error) return [r.error];
  const assertions = r.assertions.filter((a) => !a.passed).map((a) => a.message);
  return assertions.length ? assertions : [`HTTP ${r.status} ${r.statusText}`];
}

interface GroupRun {
  bucket: TestBucket;
  group: ActionGroup;
  outcome: ExecuteOutcome;
  results: StepResult[];
  seconds: number;
}

// --- JUnit report: one testsuite per action group, one testcase per step ---

const xml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!,
  );

function junitReport(runs: GroupRun[]): string {
  let tests = 0;
  let failures = 0;
  const suites = runs.map(({ bucket, group, results, seconds }) => {
    const steps = [...group.steps].sort((a, b) => a.order - b.order);
    const cases = steps.map((step) => {
      const own = results.filter((r) => r.stepId === step.id);
      const failed = own.filter(isFailedResult);
      const avg = own.length
        ? own.reduce((sum, r) => sum + r.responseTime, 0) / own.length / 1000
        : 0;
      tests++;
      let body = '';
      if (own.length === 0) {
        body = `<skipped message="not reached: an earlier step failed"/>`;
      } else if (failed.length) {
        failures++;
        const message =
          own.length > 1
            ? `${failed.length}/${own.length} iterations failed`
            : failureReasons(failed[0]!).join('; ');
        const details = failed
          .slice(0, 20)
          .map((r) => `iteration ${r.iteration}: ${failureReasons(r).join('; ')}`)
          .join('\n');
        body = `<failure message="${xml(message)}">${xml(details)}</failure>`;
      }
      return `    <testcase classname="${xml(`${bucket.name}.${group.name}`)}" name="${xml(step.name)}" time="${avg.toFixed(3)}">${body}</testcase>`;
    });
    const suiteFailures = cases.filter((c) => c.includes('<failure')).length;
    return [
      `  <testsuite name="${xml(`${bucket.name} / ${group.name}`)}" tests="${steps.length}" failures="${suiteFailures}" time="${seconds.toFixed(3)}">`,
      ...cases,
      '  </testsuite>',
    ].join('\n');
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites name="fortest" tests="${tests}" failures="${failures}">`,
    ...suites,
    '</testsuites>',
    '',
  ].join('\n');
}

// --- fortest run ---

const parseCommandLine = (args: string[]) =>
  parseArgs({
    args,
    allowPositionals: true,
    options: {
      group: { type: 'string', short: 'g', multiple: true },
      env: { type: 'string', short: 'e' },
      var: { type: 'string', short: 'v', multiple: true },
      iterations: { type: 'string' },
      concurrency: { type: 'string' },
      delay: { type: 'string' },
      junit: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });

async function run(args: string[]): Promise<number> {
  let parsedArgs;
  try {
    parsedArgs = parseCommandLine(args);
  } catch (err) {
    throw new UsageError(messageOf(err)); // unknown option, missing value, ...
  }
  const { values, positionals } = parsedArgs;
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  if (positionals.length !== 1) throw new UsageError('Expected exactly one bucket file.');

  const number = (v: string | undefined) => (v === undefined ? undefined : Number(v));
  const parsedConfig = ExecutionConfigSchema.partial().safeParse({
    iterations: number(values.iterations),
    concurrency: number(values.concurrency),
    delayBetweenSteps: number(values.delay),
  });
  if (!parsedConfig.success) {
    throw new UsageError(
      parsedConfig.error.errors
        .map((e) => `--${e.path[0] === 'delayBetweenSteps' ? 'delay' : e.path[0]}: ${e.message}`)
        .join('\n'),
    );
  }
  const config = resolveConfig(parsedConfig.data);

  const overrides = (values.var ?? []).map((pair) => {
    const eq = pair.indexOf('=');
    if (eq < 1) throw new UsageError(`--var expects KEY=VALUE, got "${pair}"`);
    return { id: randomUUID(), key: pair.slice(0, eq), value: pair.slice(eq + 1), enabled: true };
  });

  // Ctrl+C stops the run between steps, like the Stop button.
  const controller = new AbortController();
  process.once('SIGINT', () => controller.abort());

  const wanted = (values.group ?? []).map((g) => g.toLowerCase());
  const runs: GroupRun[] = [];
  for (const bucket of loadBuckets(positionals[0]!)) {
    const environment = pickEnvironment(bucket, values.env);
    const groups = [...bucket.actionGroups]
      .sort((a, b) => a.order - b.order)
      .filter((g) => !wanted.length || wanted.includes(g.name.toLowerCase()));

    for (const group of groups) {
      if (controller.signal.aborted) break;
      console.log(
        `\n${bold(group.name)} ${dim(`(${[bucket.name, environment?.name].filter(Boolean).join(' · ')})`)}`,
      );
      const results: StepResult[] = [];
      const started = performance.now();
      const outcome = await executeGroup(bucket, group, {
        runId: randomUUID(),
        config,
        environmentId: environment?.id ?? null,
        overrides,
        signal: controller.signal,
        emit: (event) => {
          if (event.type !== 'step:finished' || config.iterations > 1) return;
          const r = event.result;
          const ok = !isFailedResult(r);
          const status = r.status ? String(r.status) : '---';
          console.log(
            `  ${ok ? green('✓') : red('✗')} ${r.stepName}  ${dim(`${r.method} ${status} ${r.responseTime}ms`)}`,
          );
          if (!ok) for (const reason of failureReasons(r)) console.log(`      ${red(reason)}`);
        },
        onResult: (r) => void results.push(r),
      });
      runs.push({ bucket, group, outcome, results, seconds: (performance.now() - started) / 1000 });

      const { totalRequests, failed, avgLatency, p95 } = outcome.metrics;
      if (config.iterations > 1) {
        // One line per failing step: how many iterations failed, and the first reason.
        for (const step of group.steps) {
          const own = results.filter((r) => r.stepId === step.id);
          const failed = own.filter(isFailedResult);
          if (failed.length) {
            console.log(
              `  ${red('✗')} ${step.name}  ${dim(`${failed.length}/${own.length} iterations failed:`)} ${red(failureReasons(failed[0]!).join('; '))}`,
            );
          }
        }
      }
      const unreached = group.steps.length - new Set(results.map((r) => r.stepId)).size;
      console.log(
        `  ${failed ? red(`${failed} failed`) : green('all passed')}` +
          dim(` · ${totalRequests} requests · avg ${Math.round(avgLatency)}ms · p95 ${p95}ms`) +
          (unreached > 0 ? yellow(` · ${unreached} step(s) not reached`) : ''),
      );
    }
    if (!groups.length)
      console.warn(
        yellow(
          `No action groups${wanted.length ? ` named ${values.group!.join(', ')}` : ''} in ${bucket.name}.`,
        ),
      );
  }

  if (values.junit) {
    writeFileSync(fromCwd(values.junit), junitReport(runs));
    console.log(dim(`\nJUnit report written to ${values.junit}`));
  }

  if (controller.signal.aborted) {
    console.log(yellow('\nCancelled.'));
    return 130;
  }
  if (!runs.length) throw new UsageError('Nothing to run.');
  const failedGroups = runs.filter((r) => r.outcome.metrics.failed > 0).length;
  console.log(
    failedGroups
      ? red(`\n✗ ${failedGroups} of ${runs.length} action group(s) failed`)
      : green(`\n✓ All ${runs.length} action group(s) passed`),
  );
  return failedGroups ? 1 : 0;
}

async function main(argv: string[]): Promise<number> {
  const [command, ...args] = argv;
  if (command === 'serve') {
    await import('./server');
    return -1; // keep running
  }
  if (command === 'run') return run(args);
  console.log(USAGE);
  return command === undefined || command === '-h' || command === '--help' ? 0 : 2;
}

main(process.argv.slice(2))
  .then((code) => {
    if (code >= 0) process.exit(code);
  })
  .catch((err) => {
    console.error(
      red(
        err instanceof UsageError
          ? `error: ${err.message}\nRun "fortest --help" for usage.`
          : String(err?.stack ?? err),
      ),
    );
    process.exit(err instanceof UsageError ? 2 : 1);
  });
