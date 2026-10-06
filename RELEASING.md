# Releasing Fortest

One version number covers everything built from this repository:

| Artifact | Where | Built from |
| --- | --- | --- |
| CLI `@codegrenade/fortest-cli` (command: `fortest`) | npm | `packages/cli` (bundled with `packages/engine`, `types`, `utils`) |
| App + CLI Docker image | `ghcr.io/kodegrenade/fortest` | `Dockerfile` |
| Changelog and GitHub Release | this repository | commit messages |

Releases are built and published only by the **Release** workflow (`.github/workflows/release.yml`).
npm accepts publishes from that workflow in this repository (trusted publishing), and every
version carries [provenance](https://docs.npmjs.com/generating-provenance-statements) linking it
to the commit and workflow run that built it.

## How a release happens

1. Commits land on `main` with [conventional commit](https://www.conventionalcommits.org/) prefixes. They decide the version bump (see below) and become the release notes, so write them for users.
2. The Release workflow keeps a pull request titled `chore(main): release X.Y.Z` up to date: version bumps in `package.json` and `packages/cli/package.json`, plus `CHANGELOG.md`.
3. **Merging that PR is the decision to ship.** The workflow then:
   - tags `vX.Y.Z` and creates the GitHub Release;
   - runs typecheck and tests, builds the CLI bundle, installs the packed tarball into an empty project and runs it;
   - publishes to npm;
   - builds the image for linux/amd64 and linux/arm64 and pushes `X.Y.Z`, `X.Y`, `X` and `latest` (only after the npm job passed).

Re-running a failed release is safe: a version already on npm is skipped.

## Versioning

Fortest follows [Semantic Versioning](https://semver.org/): `MAJOR.MINOR.PATCH`. What counts as the
public contract, and so as a breaking change:

| Change | Bump | Examples |
| --- | --- | --- |
| **Breaking** | MAJOR | Removing or renaming a CLI flag; changing an exit code's meaning; changing JUnit output in a way CI parsers notice; a bucket file that used to import no longer does; changing the Docker image's entrypoint or required environment variables |
| **New capability** | MINOR | A new flag, step option, assertion operator or app feature |
| **Fix** | PATCH | Bug fixes, clearer errors, performance, UI polish |

Not part of the contract: the web UI's layout, the server's HTTP API (internal to the app), and
console output meant for people rather than parsers.

Commit prefixes map onto this: `fix:` → patch, `feat:` → minor, `feat!:` or a `BREAKING CHANGE:`
footer → major. `chore:`, `docs:`, `refactor:` and `test:` don't trigger a release on their own.

**Before 1.0** (`0.x`), anything may change: breaking changes bump the minor version (0.2 → 0.3),
and users should pin an exact version (`npx @codegrenade/fortest-cli@0.2.0 …`). 1.0.0 comes once
the CLI flags and bucket file format have held steady in real CI use; from then on the table above
applies strictly and `^1.x` ranges are safe. A specific version is chosen with a commit footer:

```
Release-As: 1.0.0
```

The bucket file's `formatVersion` (currently `1`) is a separate counter. It changes only when the
file format changes incompatibly, which is a MAJOR release with a migration on import.

## Checking a release locally

```bash
pnpm --filter @codegrenade/fortest-cli build          # → packages/cli/dist
pnpm --filter @codegrenade/fortest-cli test:package   # pack, install into an empty project, run
docker build -t fortest . && docker run --rm fortest --version
```

`packages/cli/build.mjs` writes `dist/package.json` itself (no dependencies, `bin: fortest`), so the
source `packages/cli/package.json` stays private: its workspace dependencies are for this repo and the image.
