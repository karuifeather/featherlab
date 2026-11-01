# Development guide

This document covers building from source, testing, contributing exercises, and releasing FeatherLab. For a user-facing introduction see the [README](../README.md). For architecture details see [architecture.md](architecture.md).

## Prerequisites

These are required for source development. Users installing from npm only need Node.js, Docker, and kind.

- **Node.js** 22.14 or later and npm. The project uses `node:sqlite` (built-in since 22.5, stable without flags since 22.13.1). Node.js 24 is also supported.
- **Docker Engine** with the daemon running and accessible to the current user (`docker info` should succeed).
- **kind** v0.33.0. Integration tests and the pre-push hook create real clusters.
- **A browser** with DevTools for E2E tests. Chromium is used by default; install it with `npx playwright install chromium`.

## Running from source

```bash
# Install dependencies
npm install

# Build the React frontend
npm run build

# Build the workstation Docker image (required before starting or running integration tests)
docker build -t featherlab-workstation:dev docker

# Start with the local image
FEATHERLAB_IMAGE=featherlab-workstation:dev npm start
```

On first launch, the CLI creates a kind cluster named `featherlab` and a workstation container. Both are reused on subsequent starts.

The server opens `http://127.0.0.1:4317`. This HTTP localhost endpoint is intentional for development. HTTPS for trusted LAN hosting is not implemented.

To watch and rebuild the frontend during development:

```bash
npm run dev:web
```

This starts Vite in dev mode. It does not start the CLI server; run `FEATHERLAB_IMAGE=... npm start` separately.

## npm scripts

| Script                     | What it does                                                                | Needs Docker/kind |
| -------------------------- | --------------------------------------------------------------------------- | ----------------- |
| `npm run build`            | Build the React frontend into `dist/web`                                    | no                |
| `npm test`                 | Unit tests, content validation, API/security, CLI exit codes, and packaging | no                |
| `npm run validate-content` | Validate all exercise definitions offline                                   | no                |
| `npm run pack:check`       | Verify the tarball contains the right files                                 | no                |
| `npm run lint`             | ESLint (zero warnings)                                                      | no                |
| `npm run format:check`     | Prettier format check                                                       | no                |
| `npm run format`           | Prettier autofix                                                            | no                |
| `npm run check`            | All of the above plus build                                                 | no                |
| `npm run test:kind`        | Integration suite: every exercise solved on a disposable cluster            | yes               |
| `npm run test:e2e`         | Playwright browser suite: launcher → exercise → terminal → grading          | yes               |

The pre-commit hook runs lint-staged and `npm test`. The pre-push hook runs `npm run check`, builds the Docker image, and runs `npm run test:kind`. Pass these locally before tagging a release — the GitHub Actions release workflow does not run format, lint, content validation, or unit tests.

## Project structure

```
bin/                     CLI entry point (featherlab.mjs)
docker/                  Workstation Dockerfile
exercises/               Content only: YAML definitions and Markdown (ships in the package)
  kubernetes/
    level-0/
      001-first-pod/
        exercise.yaml
        description.md
        solution.md      private; never served
        setup/           setup manifests created on every fresh start
      kq-001-kubernetes-basics/
        knowledge-check.yaml
src/
  core/                  Generic exercise engine — no Kubernetes knowledge
  tracks/kubernetes/     Everything that knows what a Pod is: validators, lifecycle, profiles
  infrastructure/        Docker, SQLite persistence, content loader
  application/           Use cases; the only place that builds public DTOs
  api/                   HTTP routes, terminal WebSocket
  app.mjs                Composition root: wires everything together
  server.mjs             HTTP bootstrap
  lib/runtime.mjs        Docker/kind provisioning
web/src/                 React UI (launcher, workspace, exercise panel, terminal)
test/
  unit/                  Fast unit tests (fake cluster, no Docker)
  integration/           Real-kind integration tests (disposable clusters)
  e2e/                   Playwright browser tests
docs/                    Project documentation
notes/                   Maintainer working notes (gitignored, not in package)
```

## Architecture overview

The CLI is a Node.js process that:

1. Provisions a `kind-featherlab` cluster and a `featherlab-workstation` Docker container.
2. Serves a local HTTP server on `127.0.0.1:4317` with the bundled React UI and the exercise API.
3. Streams an interactive terminal via WebSocket using Docker's exec API.
4. Runs exercise grading through `kubectl` invoked via `docker exec` (not from the workstation shell — through a separate allow-listed management channel).

```
npm CLI (host Node.js process)
  ├─ HTTP server: React UI + exercise API
  │    └─ exercise engine (YAML-defined exercises, validators, lifecycle)
  ├─ WebSocket: Docker exec TTY → browser terminal
  ├─ kind: kind-featherlab cluster (real Kubernetes)
  └─ Docker: featherlab-workstation (non-root; no Docker socket)
```

Exercise content is data: each exercise is a YAML definition and Markdown files. Checks are declarative `{type, params}` entries resolved against a validator registry. The grader reads cluster state through `kubectl`; it never inspects command history.

Progress is stored in `~/.featherlab/progress.sqlite` using Node.js's built-in SQLite module. The database is never placed in the npm package directory or the workstation container.

For module boundaries, lifecycle transitions, and the learning progression model, see [architecture.md](architecture.md).

## Environment profiles

Exercises declare an environment profile in `exercise.yaml`:

- **`kind-default`**: standard kind cluster; used for Levels 0–5.
- **`kind-routing`**: the default cluster with Traefik v3 and Gateway API CRDs installed (idempotent on first activation). Used for Level 6. Requires an internet connection the first time to pull the Traefik image.
- **`kind-networkpolicy`**: the default cluster with a kindnet readiness check. Used for Level 7. No additional images are pulled.

Profile components are installed in-place on the existing cluster — there is no cluster recreation.

## Testing

### Unit tests

```bash
npm test
```

Covers: fake-cluster grading, content validation, API routes and security checks, CLI exit codes, isolation guard, and a packaging test that verifies the tarball installs and runs correctly. Does not need Docker or kind.

### Content validation

```bash
npm run validate-content
```

Validates every exercise definition: schema, namespace naming, setup placement, check scope, prerequisite graph (unknown IDs, cycles, cross-track). Included in `npm test` and in the pre-push hook.

### Integration tests (real kind clusters)

```bash
FEATHERLAB_IMAGE=featherlab-workstation:dev npm run test:kind
```

Solves every exercise for real on disposable `featherlab-test-<id>` clusters. Per exercise: baseline fails, reference solution passes, alternatives pass, partial solutions fail the expected checks, switch/revisit clears state, completion stays recorded.

These tests create and delete their own clusters and state directories. They never touch the `featherlab` cluster or `~/.featherlab`. A third running kind cluster may exhaust the host's inotify limit; if cluster creation fails with "Too many open files", raise the limit:

```bash
sudo sysctl -w fs.inotify.max_user_instances=512
```

### Browser E2E tests

```bash
npm run build && FEATHERLAB_IMAGE=featherlab-workstation:dev npm run test:e2e
```

Playwright tests cover the browser workflow: launcher → exercise → terminal → grading → reset → reconnect → failure display.

```bash
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e   # reuse an installed Chrome instead of Chromium
npx playwright install chromium              # install Chromium if needed
```

E2E tests also use a disposable cluster and never touch the learner environment.

### Test safety invariants

Integration and browser tests refuse to run against the real `featherlab` cluster or `~/.featherlab`. This is enforced by `test/helpers/isolated-environment.mjs` and verified by `test/unit/isolation.test.mjs`. Resetting an exercise, running tests, or upgrading the package never modifies `~/.featherlab/progress.sqlite`.

## API routes

All routes are served at `http://127.0.0.1:<port>` (default 4317). Requests must carry `Host: 127.0.0.1:<port>` or `localhost:<port>` (DNS-rebinding defence). Mutating routes also enforce the `Origin` header.

Errors use `{error, code}`. Activate an exercise before checking it — only the exercise that owns the environment can be graded.

```
GET  /api/status                              ready, cluster, exercises count
GET  /api/resume                              last selected track/exercise with fallback
GET  /api/exercises[?track=&level=&difficulty=&tag=]
GET  /api/exercises/:id
GET  /api/exercises/:id/hints/:n
POST /api/exercises/:id/activate
POST /api/exercises/:id/check
POST /api/exercises/:id/reset
POST /api/exercises/:id/select
GET  /api/exercises/:id/progress
GET  /api/progress/track/:trackId
```

`POST /api/exercises/:id/activate` with `?discardActive=true` confirms taking the cluster from the current owner. Without it the request returns `409 ENVIRONMENT_IN_USE` and nothing is touched.

The grading response includes a `progress` field when persistence is configured:

```json
{
  "result": {
    "outcome": "passed",
    "score": { "earned": 4, "possible": 4, "percent": 100 },
    "checks": [...],
    "progress": {
      "completed": true,
      "attemptCount": 1,
      "bestScoreEarned": 4,
      "bestScorePossible": 4,
      "firstCompletedAt": "...",
      "lastAttemptedAt": "..."
    }
  }
}
```

## Release and publishing

Releases are tag-driven. Before tagging, run all quality gates locally — the release workflow does not run format, lint, validate-content, or unit tests:

```bash
npm run check
docker build -t featherlab-workstation:dev docker
FEATHERLAB_IMAGE=featherlab-workstation:dev npm run test:kind
```

Update the version in `package.json`, then tag and push:

```bash
PKG_VERSION=$(node -p "require('./package.json').version")
git tag "v${PKG_VERSION}"
git push origin "v${PKG_VERSION}"
```

The release workflow (`.github/workflows/release.yml`) runs on version tags and:

1. Verifies the tag matches `package.json`.
2. Builds `ghcr.io/karuifeather/featherlab-workstation:<version>` and `:latest` for `linux/amd64` and `linux/arm64` and pushes to GHCR using the built-in `GITHUB_TOKEN`.
3. Runs an integration smoke test against the published image.
4. Publishes the CLI to npm using npm trusted publishing (`id-token: write`; Node.js 24 in CI).

GHCR packages must have **public visibility** set after the first push so users can pull without authentication.

The manual smoke workflow (`.github/workflows/smoke.yml`) runs the full quality gate suite including real-kind tests on a GitHub runner. Run it before a release if the pre-push gates have not been run locally.

### Development image workflow

To test an in-progress change end-to-end without publishing:

```bash
npm run build
npm pack
npm install -g ./featherlab-1.1.0.tgz
FEATHERLAB_IMAGE=featherlab-workstation:dev featherlab
```

This exercises the same tarball structure as a published release. Build the workstation image first.

## Troubleshooting

**Docker connectivity**: `featherlab doctor` reports the Docker daemon and kind versions. If it fails, verify `docker info` works for your user without `sudo`.

**kind startup failures**: if `kind create cluster` fails with an inotify error, raise the limit (`sudo sysctl -w fs.inotify.max_user_instances=512`). If the kind node image is not cached, the first launch downloads ~800 MB.

**Missing workstation image**: if `FEATHERLAB_IMAGE` is set to a local image that has not been built, `featherlab` will fail at the workstation creation step. Build the image first.

**Playwright tests**: `npm run test:e2e` requires `npx playwright install chromium` or `PLAYWRIGHT_CHANNEL=chrome` pointing at an installed Chrome.

**Cluster context check**: the lifecycle driver verifies that the workstation kubeconfig context is `kind-featherlab` before any mutating operation. If the workstation was reconfigured to point elsewhere, exercises will fail at this check.

**SQLite version**: `node:sqlite` is built into Node.js 22.14+. No external `better-sqlite3` or `--experimental-sqlite` flag is needed. If you see a SQLite-related startup error, confirm your Node.js version with `node --version`.

## Security

The test harness never touches the learner's cluster or `~/.featherlab`. The workstation container has no Docker socket, runs non-root, and cannot reach the host shell. The management channel for grading is a separate, allow-listed `docker exec` that never opens a shell.

See [security.md](security.md) for the full threat model, including the shared cluster-admin credential limitation and what namespace isolation does and does not cover.
