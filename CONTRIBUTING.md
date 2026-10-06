# Contributing to Fortest

Thank you for your interest in contributing to Fortest. We welcome contributions from developers of all skill levels. Following these guidelines helps ensure a smooth contribution process for everyone.

---

## Code of Conduct

- **Respect**: Treat everyone with courtesy and respect. Focus on constructive feedback.
- **Inclusivity**: Welcome beginners and experienced developers alike. Help others learn where possible.
- **Collaboration**: Coordinate on larger feature implementations by opening or commenting on an issue first.

---

## Development Setup

Fortest uses a monorepo structure managed by `pnpm` and `turborepo`. Follow these steps to set up your environment:

### Prerequisites
- Node.js >= 20.3.0 (22.19+ or 24.5+ if your network inspects HTTPS; see the README's "HTTPS Behind Corporate Proxies")
- PNPM (Package manager)
- Docker, for Redis (`docker compose up redis -d`); without it the API falls back to in-memory storage

### Installation
1. Fork the repository and clone your fork locally.
2. Install workspace dependencies:
   ```bash
   pnpm install
   ```

### Running Locally
Run the concurrent development servers for both the React frontend and the Express backend:
```bash
pnpm dev
```
- The frontend will be available at `http://localhost:5173`.
- The backend API server will run at `http://localhost:3001`.

---

## Development Workflow

### 1. Creating a Branch
Create a branch for your work using a descriptive name:
```bash
git checkout -b feature/your-feature-name
# or
git checkout -b bugfix/your-fix-name
```

### Commit messages
Use [conventional commit](https://www.conventionalcommits.org/) prefixes (`feat:`, `fix:`, `docs:`, `chore:`, …). They decide release version numbers and become the public release notes, so describe the change for users (see [RELEASING.md](RELEASING.md)). Anything a user can notice, UI changes included, is `feat:` (new capability) or `fix:` (bug fix, polish); `chore:`, `refactor:`, `docs:` and `ci:` are left out of the release notes.

### 2. Coding Guidelines
- **CSS Styling**: We use Vanilla CSS styled with CSS variables (e.g. `var(--border-primary)`) so light and dark themes work everywhere. Do not write inline hardcoded hex colors or install external styling frameworks like Tailwind unless coordinate changes explicitly require it.
- **Buttons**: use the shared classes (`btn btn--primary`, `btn--secondary`, `btn--ghost`, `btn--icon`, sized with `btn--sm` / `btn--xs`, `btn--danger` for destructive actions) instead of inline `fontSize`/`padding` styles.
- **Hover-only controls** (row and card actions) must also appear on keyboard focus (`:focus-within`) and on touch screens (`@media (hover: none)`).
- **Small screens**: layouts must work down to 390px wide. The shared breakpoints are `900px` (sidebar becomes an overlay, the step list stacks above the editor) and `600px` (phones).
- **State Management**: Keep client state coordinated in appropriate Zustand stores under `apps/web/src/stores/`.
- **Domain Modeling**: Add any common schemas or type definitions to `@fortest/types` using Zod validation. Keep API and web apps aligned on these models.

### 3. Verification
Before committing, run what CI runs:
1. Typechecking:
   ```bash
   pnpm typecheck
   ```
2. Tests (engine, runs, CLI):
   ```bash
   pnpm test
   ```
3. Production builds:
   ```bash
   pnpm build
   ```
4. If you changed the CLI or anything it bundles (`packages/engine`, `types`, `utils`), check the package as it will be published:
   ```bash
   pnpm --filter @codegrenade/fortest-cli build && pnpm --filter @codegrenade/fortest-cli test:package
   ```

### 4. Committing Changes
Write descriptive, concise commit messages. If your commit fixes a specific issue, mention it in the commit message (e.g., `fixes #123`).

---

## Submitting Pull Requests

1. Push your changes to your fork on GitHub.
2. Open a Pull Request (PR) from your branch to the `main` branch of the parent repository.
3. In your PR description, explain:
   - What problem is solved.
   - How the changes solve it.
   - Any manual testing steps you executed.
   - Screenshots or video recordings if you made changes to the UI.
4. Wait for a maintainer to review and approve your changes.

Thank you for helping make Fortest better!
