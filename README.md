# Fortest - Real-Time API Test Orchestration Hub

Fortest is a browser-based, developer-focused API testing and orchestration tool. It is designed to group API requests into ordered, executable flows called Action Groups. This allows for sequential execution, dynamic variable chaining, visual response assertions, and concurrent load simulation with real-time feedback.

---

## Workspace Structure

The project is managed as a monorepo using `pnpm` workspaces and `turborepo` for package coordination:

- **`apps/web`**: React and Vite client application. Handles workspace creation, step editing, timeline visualization, and real-time execution dashboards.
- **`apps/api`**: Express backend application. Manages storage persistence, HTTP proxy request execution, variables interpolation, assertion checking, and WebSocket streaming.
- **`packages/types`**: Shared Zod schemas and TypeScript interface models mapping the domain entities (buckets, steps, variables, runs).
- **`packages/utils`**: Shared helper libraries such as template string variables interpolation.

---

## Core Features

### 1. Dashboard Hub
The entrance screen of the application offers an overview of all configured test buckets:
- **Layout Switcher**: Toggle between a visual Grid View or a compact List View. The preference is stored in local storage.
- **Floating Action Button (FAB)**: A floating dial in the bottom-right corner to initiate bucket creation or guided bucket imports.
- **Bucket Import/Export**: Export entire buckets including steps, variables, and assertions to JSON/YAML files. Import handles collisions by generating fresh identifier keys.
- **Schema Guide**: A built-in split screen on import shows schema templates (JSON/YAML) and allows developers to download starting templates.

### 2. Bucket Settings & Global Configuration
Once inside a bucket, developers can configure shared environmental parameters:
- **Base URL & Global Auth**: Define base URLs and default authorizations (Bearer, Basic Auth, API Key) inherited by steps.
- **Bucket Variables**: Define environmental variable sets.
- **Bulk Paste**: Allows pasting a block of text (supporting `.env` formatting, JSON objects, or JSON arrays) to quickly append multiple variables.
- **Scroll-Locking**: Locks background window scrolling when editing modals are open to prevent coordinate shifting.

### 3. Action Group timelines
Action Groups are ordered sequences of API steps:
- **Drag-and-Drop Reordering**: Timeline steps can be dynamically dragged and dropped to reorder execution sequence.
- **Step Duplication**: Quickly copy steps including preconfigured headers, request bodies, assertions, and extraction rules.
- **Edit Modal**: Update action group names and metadata descriptions.

### 4. Timeline Step Editor
Configures individual API requests:
- **Autocomplete Variables**: Triggered by typing `{{` inside parameters, paths, headers, or request bodies. Suggests global bucket variables and values extracted from preceding steps in the group.
- **Body Linting**: Provides real-time syntax checks for JSON and XML request bodies with error highlights. Includes formatting buttons to beautify JSON payloads.
- **Form Data grids**: Structured key-value inputs for form-data and x-www-form-urlencoded payloads.
- **Header Autocomplete**: Autocompletes standard headers (e.g. `Content-Type`, `Authorization`) on focus.

### 5. Extractions & Assertions
Enforce test criteria and sequence chaining:
- **Visual Extractions**: Extract values from responses (from headers, status code, or JSON body dot-notation paths) and save them under custom variable names.
- **Visual Assertions**: Build assertion tests comparing status codes, response times, headers, or body values using comparative operators (`equals`, `contains`, `exists`, `greater_than`, etc.).

### 6. Executions & Live Dashboard
Trigger runs and inspect results in real time:
- **Run Configuration**: Configure iterations, concurrency limits (multi-worker queue pools), inter-step delays, or upload data-store files (CSV/JSON records) to drive parameterized data testing.
- **Live Waterfall**: Stream progress milestones via WebSockets, rendering active status indicators, elapsed execution times, and assertion pass rates.
- **Step Result Inspector**: Inspect step results. The tabbed details panel displays:
  - Request details (method, URL, resolved Request Body).
  - Response headers.
  - Formatted Response Body.
  - Assertion checks and failure messages.
  - Extracted variables.

### 7. Run History & Analytics
- **Capped History**: Displays the history of the last 50 execution runs with status indicators and runtime configurations.
- **SVG Charts**: Renders custom responsive SVG charts plotting average latencies and P95 distribution curves across runs.
- **Interactive Coordinates**: Hovering over graph markers displays overlay cards summarizing details of specific historical runs.

---

## Technical Stack & Dependencies

- **Frontend**: React, Zustand (state coordination), Lucide React (icons), CodeMirror (code syntax linting).
- **Backend**: Express, WS (WebSockets), Redis (caching and runner orchestration with local fallback).
- **Tooling**: Turborepo, Vite, TypeScript, PNPM.

## Getting Started

You can choose to spin up Fortest immediately using Docker, or run a local development workspace on your host machine.

### Method 1: Running with Docker (Recommended for quick start)

This runs the entire stack inside containers and does not require Node, PNPM, or local Redis to be installed on your machine.

1. **Spin up the stack**:
   ```bash
   docker compose up -d --build
   ```
2. **Access the application**:
   * Open `http://localhost:3001` in your browser.

---

### Method 2: Running Locally (For development & code edits)

Use this if you are actively editing code and want hot-reloading (HMR) to trigger immediately.

1. **Run only the database dependency (via Docker)**:
   ```bash
   docker compose up redis -d
   ```
2. **Install workspace dependencies**:
   ```bash
   pnpm install
   ```
3. **Run the local development servers**:
   ```bash
   pnpm dev
   ```
   * **Frontend app**: runs on `http://localhost:5173`
   * **Backend API**: runs on `http://localhost:3001` (loads `.env` configuration from `apps/api/.env`)

---

### Additional Workspace Commands

#### Building for Production
Build client application assets and API server packages locally:
```bash
pnpm build
```

#### Type Checking
Run workspace-wide TypeScript compiler checks:
```bash
pnpm typecheck
```
