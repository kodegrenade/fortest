# fortest

Run [Fortest](https://github.com/kodegrenade/fortest) API flow tests from your terminal or CI: multi-step
request flows with chained values, assertions, environments, secrets, retries and latency budgets.
It exits non-zero when anything fails and can write a JUnit report.

```bash
npm install -g @codegrenade/fortest-cli      # or: npx @codegrenade/fortest-cli run …
fortest run tests/shop-api.yaml --env staging --var token=$API_TOKEN --junit report.xml
```

Requires Node.js 20.3 or later. The package has no dependencies.

Behind a proxy that inspects HTTPS (Netskope, Zscaler, ...), use Node.js 22.19+ or 24.5+: fortest then
trusts your operating system's certificates. On older versions, set `NODE_EXTRA_CA_CERTS` to the
proxy's root certificate. A step that gets no response says why (certificate, DNS, refused, timeout).

## Getting a bucket file

Build the flow in the Fortest app, then **Export** it (JSON or YAML) into your repository. Secret
variables are exported without their values; pass them with `--var`. Postman collections (v2.0/v2.1)
can be run directly too.

## Usage

```
fortest run <file> [options]

  -g, --group <name>       Only run this action group (repeatable; default: all)
  -e, --env <name>         Use this environment (default: the bucket's selected one; "none" for none)
  -v, --var <KEY=VALUE>    Set or override a variable (repeatable; beats everything)
  --iterations <n>         Iterations per action group (default 1; more makes it a load run)
  --concurrency <n>        Iterations run in parallel (default 1)
  --delay <ms>             Delay between steps (default 0)
  --max-p95 <ms>           Latency budget: fail an action group whose p95 is above this
  --junit <path>           Also write a JUnit XML report
fortest --version
```

| Exit code | Meaning |
| --- | --- |
| `0` | Every step and assertion passed |
| `1` | A step failed (network error, HTTP 4xx/5xx, failed assertion) or a group went over `--max-p95` |
| `2` | Bad input: unreadable or invalid file, unknown option, unknown `--group` or `--env` |
| `130` | Interrupted (Ctrl+C); the JUnit report is still written |

Secret values are redacted (`[secret:name]`) from all output and reports.

## In CI (GitHub Actions)

```yaml
- uses: actions/setup-node@v4
  with: { node-version: 20 }
- run: npx @codegrenade/fortest-cli@0.3.0 run tests/shop-api.yaml --env staging --var token=${{ secrets.API_TOKEN }} --junit fortest-report.xml # x-release-please-version
```

Pin an exact version: before 1.0, minor releases may change behaviour.

No Node.js? Use the Docker image: `docker run --rm -v "$PWD:/work" ghcr.io/kodegrenade/fortest run /work/tests/shop-api.yaml`.
The Docker image also runs the full Fortest app: `docker run --rm -p 127.0.0.1:3001:3001 ghcr.io/kodegrenade/fortest`.

Full documentation, including the bucket file format: https://github.com/kodegrenade/fortest#readme
