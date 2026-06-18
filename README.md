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
Collaborate on test suites by exporting entire buckets (including environment variables, action groups, steps, assertions, and data stores) as JSON or YAML files. Importing files automatically regenerates unique identifiers to prevent collisions with existing workspaces. You can also import existing **Postman Collections (v2.0 & v2.1)** directly to instantly bootstrap your test buckets, mapping folders, requests, variables, and auth configurations into Fortest schemas.

---

## Designing Test Bucket Files (JSON & YAML Schema Guide)

Fortest supports importing complete test suites from JSON or YAML files. Below is a detailed breakdown of the file schema, including compulsory properties, optional properties, and how they drive your testing pipelines.

### 1. Test Bucket (Root Object)
The top-level container that groups related Action Groups and defines environmental settings.

| Property | Type | Required / Optional | Description |
| :--- | :--- | :--- | :--- |
| `name` | String | **Required** | The name of the bucket (e.g., "Payment Service API"). |
| `baseUrl` | String | **Required** | The base URL prefixed to all step paths (e.g., `https://api.myapp.com`). Default: `""`. |
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
| `key` | String | **Required** | The variable placeholder label. |
| `value` | String | **Required** | The value assigned to the variable. |
| `enabled` | Boolean | Optional | Determines if the variable is active. Default: `true`. |

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
| `variableName` | String | **Required** | The variable name to store the value (referenced as `{{steps.StepName.variableName}}`). |
| `selector` | String | **Required** | Path selector mapping. For `body`, use dot-notation (e.g., `user.auth_token`). |
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
- **Global Bucket Variables**: Loaded first.
- **Data Store Parameters** (for load testing): Appended next. If a parameter in the Data Store has the same key as a Global Bucket Variable, the **Data Store parameter overrides the Global Variable**.
- **Step Extractions**: Extracted variables are stored in a step-specific namespace (e.g., `{{steps.Login Step.token}}`). Because they are isolated by step names, they will never collide with or overwrite global variables.

*Note: Unresolved placeholders are left as-is (e.g., `{{missingVar}}` remains in the string), allowing you to easily identify configuration errors in request payloads.*

### 2. Server-Side Request Forgery (SSRF) Protection
To prevent server abuse in production environments, the API backend includes an active IP security filter:
- **Default Production Mode**: In production (`NODE_ENV=production`), the backend blocks all HTTP proxy requests targeting loopback, local network, or private IP ranges (e.g., `localhost`, `127.0.0.1`, `10.0.0.0/8`, `192.168.0.0/16`).
- **Development Bypass**: To bypass this filter when running locally or inside internal Docker networks, you must inject the environment variable `ALLOW_PRIVATE_IPS=true` into the API container or process.

### 3. Run History Capping and Redis Memory Management
To keep the Redis database footprint small, Fortest enforces a strict **50-run capped retention policy** per Action Group:
- When a new execution finishes, Fortest checks the total run count for that group.
- If it exceeds 50, the oldest run records (including full HTTP headers, request and response bodies) are automatically deleted.

### 4. Space-Safe Timeline Identifiers
Action Group step names can safely contain spaces:
- **Example**: If a step is named `Create Account`, you can reference its extracted ID in downstream headers as `{{steps.Create Account.newUserId}}`. 
- **Constraint**: Step names must be unique within an Action Group. Defining multiple steps with the same name will cause downstream extraction variable lookups to overwrite each other.

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
