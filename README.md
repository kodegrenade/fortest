# Fortest — Real-Time API Test Orchestration Tool

Fortest is a developer-focused API testing and orchestration platform. It allows you to group related API requests into ordered, executable flows called **Action Groups** to simulate real-world user journeys, chain dynamic request parameters, assert response criteria, and run parameterized load tests with real-time feedback.

---

## What You Can Accomplish with Fortest

### 1. Build Sequential API Pipelines (Action Groups)
Instead of executing disjointed HTTP requests, you can chain multiple calls together into a linear execution timeline. Drag-and-drop ordering lets you adjust the execution sequence dynamically. Use this to simulate end-to-end integration flows (e.g., Login -> Create Project -> Update Settings -> Delete Project).

### 2. Chain Dynamic Response Data
Fortest solves the problem of hardcoded request parameters. You can visually define **Extraction Rules** to capture values from HTTP responses (such as JSON body dot-notation paths, response headers, or HTTP status codes) and save them to temporary variables. These variables are automatically suggested via autocompletion (`{{`) when configuring downstream paths, headers, query parameters, or request body payloads.

### 3. Enforce Declarative Test Assertions
Ensure your API endpoints behave correctly by building visual assertions. You can verify:
- HTTP Status Codes
- Response times (latencies)
- Header values
- Body payload properties (using JSON paths)

Fortest supports a variety of comparison operators (e.g., `equals`, `contains`, `exists`, `greater_than`, `matches_regex`) and automatically evaluates them as the test execution flows.

### 4. Parameterize and Simulate Load Tests
Configure concurrent runs to stress-test your backend or simulate multi-user behavior:
- **Concurrency & Iterations**: Run multiple parallel execution workers using a built-in concurrent pool.
- **Isolated Contexts**: Each worker run operates in an isolated environment variables namespace so parallel requests do not overwrite each other's extracted variables.
- **Data-Driven Inputs**: Upload JSON or CSV data sets directly to the Action Group's data store to map records to test variables, enabling parameterized testing (e.g., running 100 concurrent requests with different test user credentials). JSON must be an array of objects; CSV needs a header row, whose column names become the variable names (standard quoting is supported, so values may contain commas, quotes or line breaks).

### 5. Stream Real-Time Execution Metrics
Observe tests in real time via active WebSocket pipelines:
- Inspect step duration waterfalls, request details, and resolved request bodies.
- View real-time assertion checks and dynamic extraction outputs.
- Receive OS-level push notifications once long-running suites or load tests finish executing in the background.
- Stop a run at any time; opening a run that is still in progress (or reconnecting) catches up on everything that already happened.

### 6. Track Latency Trends and Analytics
Analyze historical performance runs to catch regressions:
- Maintain a local history of up to 50 previous execution runs per Action Group.
- Review automatically generated latency analytics (minimum, maximum, average) and response percentiles (`p50`, `p95`, `p99`).
- Interactive SVG trend lines map latencies chronologically across test runs.
- **Slower-than-usual runs are flagged**: when a run's p95 is more than 50% *and* at least 50 ms above the median p95 of the group's last 10 comparable runs (completed, same environment, same run type: single vs load), the run dashboard and history show a ⚠ badge (e.g. "p95 742ms vs usual 310ms (+139%)") and a warning toast appears. A group needs 3 comparable runs before it's judged.
- **In CI**, where there's no run history, set a latency budget instead: `fortest run … --max-p95 500` fails any action group whose p95 is over 500 ms (per-step limits are `response_time` assertions).

### 7. Export, Import, and Share Test Suites
Collaborate on test suites by exporting entire buckets (including environment variables, action groups, steps, assertions, and data stores) as JSON or YAML files. Importing files automatically regenerates unique identifiers to prevent collisions with existing workspaces. You can also import existing **Postman Collections (v2.0 & v2.1)** directly to instantly bootstrap your test buckets, mapping folders, requests, variables, and auth configurations into Fortest schemas.

### 8. Run Your Flows in CI
Export a bucket and run it with the `fortest` CLI: it exits non-zero when anything fails and can write a JUnit report, so API flow tests can gate a pipeline. See [Running Tests from the Command Line and CI](#running-tests-from-the-command-line-and-ci).

---

## Designing Test Bucket Files (JSON & YAML Schema Guide)

Fortest supports importing complete test suites from JSON or YAML files. Below is a detailed breakdown of the file schema, including compulsory properties, optional properties, and how they drive your testing pipelines.

### 1. Test Bucket (Root Object)
The top-level container that groups related Action Groups and defines environmental settings.

| Property | Type | Required / Optional | Description |
| :--- | :--- | :--- | :--- |
| `formatVersion` | Number | Optional | The file format version, written by **Export** (currently `1`). Files without it are read as version 1; a file from a newer format is refused with a request to upgrade Fortest. |
| `name` | String | **Required** | The name of the bucket (e.g., "Payment Service API"). |
| `baseUrl` | String | **Required** | The base URL prefixed to all step paths (e.g., `https://api.myapp.com`). Default: `""`. |
| `auth` | Object | Optional | Global authenticator inherited by all steps. Default: `{ type: "none" }`. |
| `variables` | Array | Optional | Environmental key-value variables. Default: `[]`. |
| `actionGroups` | Array | Optional | List of test workflows. Default: `[]`. |
| `environments` | Array | Optional | Named variable sets (e.g. local, staging, prod), each `{ "name": "staging", "variables": [...] }`. Default: `[]`. |
| `activeEnvironmentId` | String | Optional | The environment runs use: its `id`, or in hand-written files simply its `name`. Default: none. |

#### How to use the `auth` tag:
The `auth` object allows you to specify global authentication details. Optional configurations include:
- **Bearer Token**: `{ "type": "bearer", "bearer": { "token": "YOUR_TOKEN" } }`
- **Basic Auth**: `{ "type": "basic", "basic": { "username": "admin", "password": "securepassword" } }`
- **API Key**: `{ "type": "api-key", "apiKey": { "key": "x-api-key", "value": "my-secret-key", "addTo": "header" } }` (where `addTo` can be `"header"` or `"query"`_).

---

### 2. Bucket Variables (`variables[]`)
Shared environment parameters that can be interpolated in any URL, header, query param, or request body using double braces (e.g., `{{apiUrl}}`).

| Property | Type | Required / Optional | Description |
| :--- | :--- | :--- | :--- |
| `key` | String | **Required** | The variable placeholder label. |
| `value` | String | **Required** | The value assigned to the variable. |
| `enabled` | Boolean | Optional | Determines if the variable is active. Default: `true`. |
| `secret` | Boolean | Optional | Marks a secret (see below). Default: `false`. |

#### Secret variables
Mark tokens, passwords and keys as secret (the lock icon next to a variable, in the bucket or an environment):
- **Masked** in the app, with a button to reveal; autocomplete shows "Secret value" instead of the value.
- **Left out of exports**: the exported file keeps the variable and its `secret: true` flag with an empty value, so bucket files are safe to commit. Supply the value in CI with `--var` (the CLI warns about any secret left without one).
- **Redacted from run results**: wherever a secret's value would appear (URL, request or response body, headers, errors, assertion messages, extracted values) it is stored and shown as `[secret:name]`, in the app, run history, CLI output and JUnit reports. Requests themselves use the real value. Values shorter than 4 characters aren't redacted.
- Secrets are still stored in plain text in your local Redis, like everything else in Fortest.

---

#### Environments: one bucket, many targets
Put what differs between targets (hosts, credentials) into environments, and reference it from the bucket. A common setup is a base URL of `{{baseUrl}}`:

```yaml
baseUrl: "{{baseUrl}}"
variables:
  - { key: baseUrl, value: "http://localhost:8080" }   # shared default
environments:
  - name: staging
    variables: [{ key: baseUrl, value: "https://staging.api.example.com" }]
  - name: prod
    variables: [{ key: baseUrl, value: "https://api.example.com" }]
activeEnvironmentId: staging
```

In the app, environments are edited as tabs under the bucket's **Variables**, and the one to run with is picked in the sidebar. The CLI uses the selected one unless told otherwise (`--env prod`, or `--env none`).

---

### 3. Action Groups (`actionGroups[]`)
Ordered test suites representing an end-to-end integration scenario.

| Property | Type | Required / Optional | Description |
| :--- | :--- | :--- | :--- |
| `name` | String | **Required** | The name of the test suite. |
| `description` | String | Optional | Documentation explaining the purpose of this group. Default: `""`. |
| `steps` | Array | Optional | List of request steps. Default: `[]`. |
| `dataStore` | Object | Optional | Parameter file records used to feed variables during concurrent load tests. |

#### Data Store Optimization:
The `dataStore` object contains records for data-driven testing:
```json
"dataStore": {
  "name": "User Accounts",
  "records": [
    { "testUser": "user1@example.com", "testPass": "pwd1" },
    { "testUser": "user2@example.com", "testPass": "pwd2" }
  ]
}
```
During multi-iteration or load tests, Fortest will automatically feed each concurrent iteration with the corresponding record, allowing you to use `{{testUser}}` in your steps.

---

### 4. Steps (`steps[]`)
Individual HTTP requests within an Action Group.

| Property | Type | Required / Optional | Description |
| :--- | :--- | :--- | :--- |
| `name` | String | **Required** | The name of the request (e.g., "Authenticate User"). |
| `method` | String | **Required** | HTTP method (e.g., `"GET"`, `"POST"`, `"PUT"`, `"DELETE"`). Default: `"GET"`. |
| `path` | String | **Required** | Endpoint route appended to `baseUrl` (e.g., `"/v1/login"`). Default: `"/"`. |
| `headers` | Array | Optional | Request headers array. Default: `[]`. |
| `params` | Array | Optional | Query parameters array. Default: `[]`. |
| `body` | Object | Optional | Request body configuration. Default: `{ type: "none", content: "" }`. |
| `auth` | Object | Optional | Step-level auth overrides. Inherits bucket auth if omitted. |
| `extractions` | Array | Optional | Extraction rules to parse response parameters. Default: `[]`. |
| `assertions` | Array | Optional | Assertions to validate responses. Default: `[]`. |
| `retry` | Object | Optional | Resend until the step passes: `{ "maxAttempts": 2-100, "intervalMs": 0-60000 }`. See below. |

#### How to use headers and query parameters arrays:
Headers and params use key-value schemas:
```json
"headers": [
  { "key": "Accept", "value": "application/json", "enabled": true }
]
```

#### How to use the `body` tag:
Supports multiple formats:
- **JSON**: `{ "type": "json", "content": "{\"email\":\"{{email}}\"}" }`
- **Form Data / URL Encoded**: `{ "type": "form-data", "content": "key1=val1&key2=val2" }` (or standard raw content formats).

---

#### Retry / poll steps (`retry`)
For asynchronous APIs (jobs, payments, provisioning), a step can resend its request until it passes: its assertions pass and there's no network error or 4xx/5xx response. Without assertions it simply waits for a successful response.

```yaml
- name: Wait for export
  path: /exports/{{steps.Start export.id}}
  retry: { maxAttempts: 30, intervalMs: 2000 }   # poll every 2 s, give up after 30 tries
  assertions:
    - { target: body, selector: status, operator: equals, expected: done }
  extractions:
    - { variableName: url, source: body, selector: downloadUrl }
```

Only the final attempt is recorded (with its attempt count and total wait, e.g. "3 attempts in 4.1s"), and only its extractions reach later steps. Run metrics count the step once. Stopping a run interrupts the wait between attempts. In the app, retry is set at the top of a step's **Assertions** tab.

---

### 5. Extraction Rules (`extractions[]`)
Rules that extract values from a response and save them as variables for subsequent steps.

| Property | Type | Required / Optional | Description |
| :--- | :--- | :--- | :--- |
| `variableName` | String | **Required** | The variable name to store the value (referenced as `{{steps.StepName.variableName}}`). |
| `selector` | String | **Required** for `body` and `header` | Path selector mapping. For `body`, use dot-notation (e.g., `user.auth_token`); for `header`, the header name. Not needed for `status`. |
| `source` | String | Optional | Where to extract from (`"body"`, `"header"`, `"status"`). Default: `"body"`. |

---

### 6. Test Assertions (`assertions[]`)
Assertion criteria that must pass for the step (and run) to be marked as successful.

| Property | Type | Required / Optional | Description |
| :--- | :--- | :--- | :--- |
| `target` | String | **Required** | Target parameter (`"status"`, `"body"`, `"header"`, `"response_time"`). |
| `operator` | String | **Required** | Operator (`"equals"`, `"not_equals"`, `"contains"`, `"greater_than"`, `"less_than"`, `"exists"`, `"matches_regex"`). |
| `expected` | String | **Required** | The expected value. Autocomplete-enabled (can use `{{variables}}`). |
| `selector` | String | Optional | The dot-notation path (required if target is `"body"` or `"header"`). Default: `""`. |

---

### Complete Templates

#### JSON Template (`fortest-template.json`)
```json
{
  "name": "Sample API Workspace",
  "baseUrl": "https://api.example.com",
  "auth": {
    "type": "none"
  },
  "variables": [
    {
      "key": "defaultRole",
      "value": "developer",
      "enabled": true
    }
  ],
  "actionGroups": [
    {
      "name": "User Auth Flow",
      "description": "Log in a user, extract a bearer token, and verify profile retrieval.",
      "steps": [
        {
          "name": "Login Step",
          "method": "POST",
          "path": "/auth/login",
          "headers": [
            { "key": "Content-Type", "value": "application/json", "enabled": true }
          ],
          "body": {
            "type": "json",
            "content": "{\"username\": \"admin\", \"password\": \"secret\"}"
          },
          "extractions": [
            {
              "variableName": "authToken",
              "source": "body",
              "selector": "data.token"
            }
          ],
          "assertions": [
            {
              "target": "status",
              "operator": "equals",
              "expected": "200"
            }
          ]
        },
        {
          "name": "Get Profile",
          "method": "GET",
          "path": "/users/profile",
          "auth": {
            "type": "bearer",
            "bearer": {
              "token": "{{steps.Login Step.authToken}}"
            }
          },
          "assertions": [
            {
              "target": "status",
              "operator": "equals",
              "expected": "200"
            },
            {
              "target": "body",
              "selector": "user.role",
              "operator": "equals",
              "expected": "{{defaultRole}}"
            }
          ]
        }
      ]
    }
  ]
}
```

#### YAML Template (`fortest-template.yaml`)
```yaml
name: "Sample API Workspace"
baseUrl: "https://api.example.com"
auth:
  type: "none"
variables:
  - key: "defaultRole"
    value: "developer"
    enabled: true
actionGroups:
  - name: "User Auth Flow"
    description: "Log in a user, extract a bearer token, and verify profile retrieval."
    steps:
      - name: "Login Step"
        method: "POST"
        path: "/auth/login"
        headers:
          - key: "Content-Type"
            value: "application/json"
            enabled: true
        body:
          type: "json"
          content: "{\"username\": \"admin\", \"password\": \"secret\"}"
        extractions:
          - variableName: "authToken"
            source: "body"
            selector: "data.token"
        assertions:
          - target: "status"
            operator: "equals"
            expected: "200"
      - name: "Get Profile"
        method: "GET"
        path: "/users/profile"
        auth:
          type: "bearer"
          bearer:
            token: "{{steps.Login Step.authToken}}"
        assertions:
          - target: "status"
            operator: "equals"
            expected: "200"
          - target: "body"
            selector: "user.role"
            operator: "equals"
            expected: "{{defaultRole}}"
```

---

## Importing Postman Collections

Fortest supports importing Postman Collection exports (v2.0 and v2.1 JSON formats) directly. When importing a Postman collection, the system automatically detects the format, creates a new Test Bucket, and maps the Postman schema to Fortest's execution model.

### 1. Conceptual Mapping

| Postman Component | Fortest Component | Conversion Details |
| :--- | :--- | :--- |
| **Collection** | **Test Bucket** | The collection name is used as the bucket name. The base URL is automatically extracted from request URLs. |
| **Top-level Folders** | **Action Groups** | Each top-level folder becomes an Action Group containing its requests as steps. |
| **Nested Subfolders** | **Flattened Action Groups** | Since Fortest supports single-level Action Groups, any nested folders are flattened into the parent top-level Action Group with a warning. |
| **Root-level Requests** | **Ungrouped Requests** | Requests at the root level of the collection are grouped into a default action group named `"Ungrouped Requests"`. |
| **Variables** | **Bucket Variables** | Collection-level variables are imported as global Bucket Variables. |
| **Request Steps** | **Steps** | Individual HTTP requests are imported as steps within the respective Action Group, keeping their relative order. |

### 2. Request Mapping Details

- **HTTP Methods & Paths**: Mapped directly (e.g., `GET`, `POST`, `PUT`, `DELETE`).
- **URL Decomposition**: The converter parses the Postman URL object or string. It attempts to extract a common base URL (e.g., `https://api.example.com`) for the Test Bucket and converts request paths to relative endpoints (e.g., `/users`).
- **Headers & Query Params**: Headers and parameters are mapped to key-value objects, preserving active/disabled states.
- **Request Bodies**:
  - `raw` (JSON or text) is mapped to JSON/raw step bodies.
  - `formdata` and `urlencoded` body types are mapped to form-data and urlencoded payload configurations respectively.
- **Authentication**:
  - Supports **Bearer Token**, **Basic Auth**, and **API Key** authentication defined at both the Collection level (global) and individual Request/Step level.

### 3. Unsupported Features and Warnings

Postman collections can contain execution logic or configuration not supported by Fortest. During import, the frontend displays warning notifications for elements that were skipped or flattened:
- **Scripts**: Pre-request and test scripts (JavaScript) are skipped.
- **Nested Folders**: Warnings are shown for nested folders that were flattened into their parent folder.
- **Unsupported Auth**: Auth methods like `oauth2`, `digest`, `hawk`, or `oauth1` are skipped, defaulting the step to use `"none"` or inherit the bucket-level auth.

---

## Advanced Execution & Variable Scoping Rules

### 1. Variable Precedence and Namespace Scopes
When Fortest resolves template variables (e.g., `{{placeholder}}`) during execution, it compiles a runtime context mapping keys to values. Collision resolution is handled in the following order:
- **Bucket Variables**: Loaded first (the shared defaults).
- **Environment Variables**: The selected environment's variables override bucket variables with the same key.
- **Data Store Parameters** (for load testing): Each iteration's record overrides both of the above.
- **CLI `--var` Overrides**: Beat everything else, so a pipeline can always inject a value.
- **Step Extractions**: Extracted variables are stored in a step-specific namespace (e.g., `{{steps.Login Step.token}}`). Because they are isolated by step names, they will never collide with or overwrite global variables.

*Note: Unresolved placeholders are left as-is (e.g., `{{missingVar}}` remains in the string), allowing you to easily identify configuration errors in request payloads.*

### 2. Local-Only Access
Fortest is a local tool and can send requests to any address, including `localhost` and private networks (testing local APIs is the main use case). To keep that power on your machine only:
- **Loopback binding**: The API listens on `127.0.0.1` (override with `HOST`). Docker Compose publishes ports on `127.0.0.1` only, for both the app and Redis.
- **Host / Origin check**: Requests and WebSocket connections whose `Host` or `Origin` isn't `localhost`, `127.0.0.1` or `[::1]` are rejected with `403`. This blocks other websites open in your browser (including DNS-rebinding attacks) from reading your buckets or running requests through Fortest.
- **Run limits**: A single run accepts at most `10,000` iterations, `100` concurrent workers and a `60,000` ms delay between steps.

There is no authentication. Do not expose Fortest on a public or shared network.

### 3. Run Storage, Retention and Cancellation
Each run is stored as a small summary (status, configuration, metrics) plus a list that every step result is appended to as it finishes, so long runs never rewrite what they've already stored.
- **History cap**: Fortest keeps the **50 most recent runs** per Action Group; older runs and their results are deleted automatically.
- **Response bodies**: single runs keep every request and response body. Multi-iteration (load) runs keep bodies only for **iteration 1 and for failed steps**; other results keep status, timing, headers, assertions and extractions. Stored bodies are capped at 1 MB each.
- **Stopping a run**: the **Stop** button (run dashboard or the Runs dropdown) cancels the run between steps; it is saved with status `cancelled` and its partial results. API: `POST /api/runs/:id/cancel`.
- **Restarts**: runs that were in progress when the server stopped are marked `failed` ("Interrupted") on the next start.

### 4. Space-Safe Timeline Identifiers
Action Group step names can safely contain spaces:
- **Example**: If a step is named `Create Account`, you can reference its extracted ID in downstream headers as `{{steps.Create Account.newUserId}}`. 
- **Constraint**: Step names must be unique within an Action Group (the editor enforces this).
- **Renaming**: renaming a step in the editor updates every `{{steps.<old name>.…}}` reference in the group's other steps, and tells you how many it changed. References in hand-edited bucket files are not rewritten.

---

## Workspace Architecture

The project is structured as a monorepo coordinated by `pnpm` workspaces and `turborepo`:

- **`apps/web`**: Single Page Application built using React, Vite, and CSS. Handles configuration, drag-and-drop timeline management, and real-time execution dashboards.
- **`apps/api`**: Node.js Express server: run storage (Redis or in-memory), WebSocket streaming and the web app's API. Its entry point also runs the CLI (`fortest serve` in Docker).
- **`packages/engine`**: The execution engine (variables, extractions, assertions, retries, concurrent load runs) and bucket-file import/export, with no storage or server, so the server and the CLI run the same code.
- **`packages/cli`**: The `fortest` command, published to npm as `@codegrenade/fortest-cli` as a single bundled file (see [RELEASING.md](RELEASING.md)).
- **`packages/types`**: Shared Zod schemas and TypeScript models representing buckets, steps, results, and metrics.
- **`packages/utils`**: Core shared libraries (including the template string variables interpolator).

---

## Getting Started

### Method 1: Running with Docker (Quick Start)

Run the entire application stack instantly. This option packages both the backend API and the compiled React assets together, serving them on port `3001` with local Redis persistence.

1. **Start the containers**:
   ```bash
   docker compose up -d --build
   ```
2. **Access the application**:
   - Open `http://localhost:3001` in your browser.

---

### Method 2: Running Locally (For Development)

Use this method if you are making code changes and need hot-reloading (HMR) to reflect immediately.

1. **Spin up the database dependency (Docker)**:
   ```bash
   docker compose up redis -d
   ```
2. **Install dependencies**:
   ```bash
   pnpm install
   ```
3. **Start the development servers**:
   ```bash
   pnpm dev
   ```
   - **Frontend App**: `http://localhost:5173`
   - **Backend API**: `http://localhost:3001`

---

## Running Tests from the Command Line and CI

The `fortest` CLI runs a bucket file (an exported JSON/YAML bucket, or a Postman collection) without the server or Redis, and fails with a non-zero exit code when any step or assertion fails. It runs the same engine as the web app.

### Installing the CLI

| How | Command |
| :--- | :--- |
| On your machine (Node.js 20.3+) | `npm install -g @codegrenade/fortest-cli`, then `fortest run …` |
| Pinned per project | `npm install -D @codegrenade/fortest-cli`, then `"test:api": "fortest run tests/api.yaml"` in `package.json` |
| Without installing | `npx @codegrenade/fortest-cli run …` |
| Without Node.js | `docker run --rm -v "$PWD:/work" ghcr.io/kodegrenade/fortest run /work/tests/api.yaml` |
| From this repository | `pnpm fortest run …` |

The npm package and the `ghcr.io` image are published by the release workflow from the first release onward (see [RELEASING.md](RELEASING.md)). The package bundles everything it needs and has no dependencies.

### Usage

```bash
fortest run tests/shop-api.yaml                         # all action groups
fortest run tests/shop-api.yaml --group "Checkout Flow" # just one (repeatable)
fortest run tests/shop-api.yaml --env staging          # pick an environment ("none" for none)
fortest run tests/shop-api.yaml --var token=$API_TOKEN  # set/override variables, e.g. secrets (redacted in the output)
fortest run tests/shop-api.yaml --junit report.xml      # JUnit XML for CI test summaries
fortest run tests/shop-api.yaml --iterations 50 --concurrency 10   # load run
fortest run tests/shop-api.yaml --max-p95 500           # latency budget: fail a group whose p95 > 500 ms
fortest --help
```

| Exit code | Meaning |
| :--- | :--- |
| `0` | Every step and assertion passed |
| `1` | A step failed (network error, HTTP 4xx/5xx, or a failed assertion), or a group went over `--max-p95` |
| `2` | Bad input: unreadable or invalid file, unknown option, unknown `--group` or `--env` |
| `130` | Interrupted with Ctrl+C (the JUnit report is still written) |

Inside this repository, `pnpm fortest` reports any failure as exit code `1`; the installed `fortest` command and the Docker image return the exact code. Bucket files are the same format as the app's **Export** (see the schema guide above), so the usual workflow is: build the flow in the app, export it into your repo, run it in CI.

With Docker, the image runs the CLI when given a command (and serves the app otherwise):

```bash
docker run --rm -v "$PWD:/work" --user "$(id -u):$(id -g)" ghcr.io/kodegrenade/fortest run /work/tests/shop-api.yaml --junit /work/report.xml
docker run --rm -p 127.0.0.1:3001:3001 ghcr.io/kodegrenade/fortest     # the app, without Redis (in-memory storage)
docker build -t fortest .                                                # or build the image from this repository
```

- Inside a container, `localhost` is the container itself. To test an API running on your machine, point the bucket (or an environment) at `http://host.docker.internal:<port>` (Docker Desktop provides this name; with plain Docker Engine on Linux add `--add-host=host.docker.internal:host-gateway`, and the API must listen on more than `127.0.0.1`).
- `--user` keeps the report owned by you on Linux; without it, files written to the mount belong to root.
- Exit codes come through `docker run` unchanged (`0`, `1`, `2`, `130`).

### GitHub Actions example

In any repository that holds your bucket files:

```yaml
name: API tests
on: [push, pull_request]

jobs:
  api-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npx @codegrenade/fortest-cli run tests/shop-api.yaml --env staging --var token=${{ secrets.API_TOKEN }} --junit fortest-report.xml
      - uses: mikepenz/action-junit-report@v4 # shows per-step results on the run and PR
        if: always()
        with: { report_paths: fortest-report.xml }
```

Pin the version once your flows depend on it (for example `npx @codegrenade/fortest-cli@1.2.3 …`, or a `devDependency`), so pipelines don't change behaviour on a new release.

---

## Workspace Commands

- **Run the CLI**: `pnpm fortest run <file>` (see above).
- **Run Tests**: `pnpm test` (core logic, a live end-to-end run and the CLI).
- **Build Project**: `pnpm build` (Compiles the React assets).
- **Run Typechecking**: `pnpm typecheck` (Runs compiler checks across all workspaces).
- **Clean Workspace**: `pnpm clean` (Wipes build outputs and cached directories).
