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
