# Fortest — Real-Time API Test Orchestration & Load Testing Hub

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
- **Data-Driven Inputs**: Upload JSON or CSV data sets directly to the Action Group's data store to map records to test variables, enabling parameterized testing (e.g., running 100 concurrent requests with different test user credentials).

### 5. Stream Real-Time Execution Metrics
Observe tests in real time via active WebSocket pipelines:
- Inspect step duration waterfalls, request details, and resolved request bodies.
- View real-time assertion checks and dynamic extraction outputs.
- Receive OS-level push notifications once long-running suites or load tests finish executing in the background.

### 6. Track Latency Trends and Analytics
Analyze historical performance runs to catch regressions:
- Maintain a local history of up to 50 previous execution runs per Action Group.
- Review automatically generated latency analytics (minimum, maximum, average) and response percentiles (`p50`, `p95`, `p99`).
- Interactive SVG trend lines map latencies chronologically across test runs.

### 7. Export, Import, and Share Test Suites
Collaborate on test suites by exporting entire buckets (including environment variables, action groups, steps, assertions, and data stores) as JSON or YAML files. Importing files automatically regenerates unique identifiers to prevent collisions with existing workspaces.

---

## Designing Test Bucket Files (JSON & YAML Schema Guide)

Fortest supports importing complete test suites from JSON or YAML files. Below is a detailed breakdown of the file schema, including compulsory properties, optional properties, and how they drive your testing pipelines.

### 1. Test Bucket (Root Object)
The top-level container that groups related Action Groups and defines environmental settings.

| Property | Type | Required / Optional | Description |
| :--- | :--- | :--- | :--- |
| `name` | String | **Compulsory** | The name of the bucket (e.g., "Payment Service API"). |
| `baseUrl` | String | Optional | The base URL prefixed to all step paths (e.g., `https://api.myapp.com`). Default: `""`. |
| `auth` | Object | Optional | Global authenticator inherited by all steps. Default: `{ type: "none" }`. |
| `variables` | Array | Optional | Environmental key-value variables. Default: `[]`. |
| `actionGroups` | Array | Optional | List of test workflows. Default: `[]`. |

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
| `key` | String | **Compulsory** | The variable placeholder label. |
| `value` | String | **Compulsory** | The value assigned to the variable. |
| `enabled` | Boolean | Optional | Determines if the variable is active. Default: `true`. |

---

### 3. Action Groups (`actionGroups[]`)
Ordered test suites representing an end-to-end integration scenario.

| Property | Type | Required / Optional | Description |
| :--- | :--- | :--- | :--- |
| `name` | String | **Compulsory** | The name of the test suite. |
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
| `name` | String | **Compulsory** | The name of the request (e.g., "Authenticate User"). |
| `method` | String | Optional | HTTP method (e.g., `"GET"`, `"POST"`, `"PUT"`, `"DELETE"`). Default: `"GET"`. |
| `path` | String | Optional | Endpoint route appended to `baseUrl` (e.g., `"/v1/login"`). Default: `"/"`. |
| `headers` | Array | Optional | Request headers array. Default: `[]`. |
| `params` | Array | Optional | Query parameters array. Default: `[]`. |
| `body` | Object | Optional | Request body configuration. Default: `{ type: "none", content: "" }`. |
| `auth` | Object | Optional | Step-level auth overrides. Inherits bucket auth if omitted. |
| `extractions` | Array | Optional | Extraction rules to parse response parameters. Default: `[]`. |
| `assertions` | Array | Optional | Assertions to validate responses. Default: `[]`. |

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

### 5. Extraction Rules (`extractions[]`)
Rules that extract values from a response and save them as variables for subsequent steps.

| Property | Type | Required / Optional | Description |
| :--- | :--- | :--- | :--- |
| `variableName` | String | **Compulsory** | The variable name to store the value (referenced as `{{steps.StepName.variableName}}`). |
| `selector` | String | **Compulsory** | Path selector mapping. For `body`, use dot-notation (e.g., `user.auth_token`). |
| `source` | String | Optional | Where to extract from (`"body"`, `"header"`, `"status"`). Default: `"body"`. |

---

### 6. Test Assertions (`assertions[]`)
Assertion criteria that must pass for the step (and run) to be marked as successful.

| Property | Type | Required / Optional | Description |
| :--- | :--- | :--- | :--- |
| `target` | String | **Compulsory** | Target parameter (`"status"`, `"body"`, `"header"`, `"response_time"`). |
| `operator` | String | **Compulsory** | Operator (`"equals"`, `"not_equals"`, `"contains"`, `"greater_than"`, `"less_than"`, `"exists"`, `"matches_regex"`). |
| `expected` | String | **Compulsory** | The expected value. Autocomplete-enabled (can use `{{variables}}`). |
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

## Workspace Architecture

The project is structured as a monorepo coordinated by `pnpm` workspaces and `turborepo`:

- **`apps/web`**: Single Page Application built using React, Vite, and CSS. Handles configuration, drag-and-drop timeline management, and real-time execution dashboards.
- **`apps/api`**: Node.js Express server. Executes proxy requests, handles WebSocket streaming, parses variables/assertions, and runs concurrent load test routines.
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

## Workspace Commands

- **Build Project**: `pnpm build` (Compiles React assets and TypeScript API files).
- **Run Typechecking**: `pnpm typecheck` (Runs compiler checks across all workspaces).
- **Clean Workspace**: `pnpm clean` (Wipes build outputs and cached directories).
