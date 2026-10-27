# FeatherLab

A local-first Kubernetes practice playground. It includes the npm CLI, a Docker workstation, a real kind cluster, a React launcher, a browser terminal, and a data-driven exercise engine with graded Kubernetes exercises.

## Prerequisites

- Linux host (initially developed for Fedora/Nobara; macOS is exploratory, Windows/WSL2 is not validated).
- Node.js >= 22.14 and npm.
- Docker Engine with daemon running and access for the current user (`docker info`).
- `kind` CLI; recommended v0.33.0. https://kind.sigs.k8s.io/docs/user/quick-start/
- Internet access on first start for the workstation, kind node image, and practice workload image. Afterwards some work is possible offline if images are cached.

The CLI uses your **host Docker + kind** to create `kind-featherlab` and a separate workstation container. It does **not** mount the Docker socket into the learner workstation.

## Run locally from source

```bash
npm install
npm run build
npm test

docker build -t featherlab-workstation:dev docker
FEATHERLAB_IMAGE=featherlab-workstation:dev npm start
```

On first launch the CLI creates the isolated kind cluster; later launches reuse it. The CLI opens `http://127.0.0.1:4317` in the default browser. This **HTTP localhost endpoint is intentional** for development; HTTPS for trusted LAN hosting will be a separate feature. The UI defaults to localhost-only and must not be placed directly on the public internet.

Alternatively, test the actual packaged CLI without an npm registry publication:

```bash
npm run build
npm pack
npm install -g ./featherlab-0.2.0.tgz
FEATHERLAB_IMAGE=featherlab-workstation:dev featherlab
```

This `npm pack` approach exercises the same tarball structure users will install when published. You must build the image first as shown above.

## CLI

```bash
featherlab             # start workstation and browser UI (alias: featherlab start)
featherlab stop        # gracefully stop a running featherlab, or stop resources directly
featherlab update      # upgrade to the latest version from npm
featherlab doctor      # check Docker daemon and kind
featherlab status      # show runtime status
featherlab exercises   # list available exercises
featherlab reset [id]  # reset an exercise (default k8s-0001) to its initial state
featherlab validate-content [dir]  # validate exercise definitions offline (no Docker needed)
featherlab --version   # print version (alias: -V)
featherlab --help
```

Environment overrides:

| Variable               | Default                                                 | Notes                     |
| ---------------------- | ------------------------------------------------------- | ------------------------- |
| `FEATHERLAB_IMAGE`     | `ghcr.io/karuifeather/featherlab-workstation:<version>` | Workstation image         |
| `featherlab_PORT`      | `4317`                                                  | HTTP port; must be ≥ 1024 |
| `FEATHERLAB_STATE_DIR` | `~/.featherlab`                                         | Kubeconfigs, PID file     |

**Graceful shutdown:** `featherlab stop` reads `~/.featherlab/featherlab.pid`. If the file exists and the recorded process is still the FeatherLab CLI (verified by entry-point path and process start time, not just the PID), it sends SIGTERM and waits up to 15 seconds for a clean exit. If no running instance is found, it stops the workstation container and kind node containers directly. The cluster and its workloads are always preserved; only the containers are stopped.

Ctrl+C while `featherlab` is running triggers the same graceful shutdown. A second Ctrl+C forces an immediate exit.

**Upgrading:** `featherlab update` performs a fresh version check against the npm registry (bypassing the local cache), then runs `npm install -g featherlab@<latest>`. It refuses to run while a `featherlab` process is live — stop the server first. If the npm install fails due to permissions, it prints the manual command (`sudo npm install -g …`) rather than escalating automatically. After a successful upgrade, if the running workstation container was built with an older image, the command notes the mismatch and reminds you that the existing workstation has not been modified; the updated image will be used the next time a new workstation is created.

Other commands (`status`, `reset`, `exercises`, …) never make network requests. They read a version cache warmed by `featherlab start` and display a one-line update notice when the cache indicates a newer version is available.

To completely remove the local lab: `featherlab stop`, then `docker rm featherlab-workstation`, `kind delete cluster --name featherlab`, and optionally delete `~/.featherlab`. **Never run these cleanup commands for clusters you wish to keep.**

## Release pipeline: test distribution from day one

One GitHub repository (`karuifeather/featherlab` assumed; change package.json and image defaults if the owner differs):

1. Push this source to the chosen public GitHub repository. GitHub Actions CI runs formatting, lint, content validation and unit tests, builds the frontend, verifies and installs the npm tarball, and then (in a separate job) runs the kind lifecycle and Playwright browser tests against disposable clusters. The release workflow reuses the same gates before publishing.
2. Confirm `featherlab` is free on the public npm registry, or change `package.json` name to a scoped package such as `@karuifeather/featherlab` (the executable still remains `featherlab`).
3. Configure **npm trusted publishing** for the exact repository and `.github/workflows/release.yml`, allowing direct `npm publish`. For a brand-new package, follow npm's bootstrap/publisher setup UI instructions. npm trusted publishing needs Node 22.14+, npm 11.5.1+, and GitHub Actions `id-token: write`; this workflow uses Node 24. https://docs.npmjs.com/trusted-publishers/
4. Tag and push the version matching `package.json`:

   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

5. The release workflow builds and pushes `ghcr.io/<your-user>/featherlab-workstation:0.1.0` and `:latest`, then publishes the compiled CLI on npm. GHCR uses the built-in GITHUB_TOKEN (no PAT required). **Set the GHCR package visibility to Public** after the first push so that anonymous users can pull.
6. On a clean machine test the actual release:

   ```bash
   npm install -g featherlab
   featherlab doctor
   featherlab
   ```

   If using a scoped npm package, install that name instead.

7. The release workflow's smoke job and the manual **Real kind smoke test** workflow validate the full Docker → kind → browser API → grading path with the real `featherlab` names on a CI runner.

**Release consistency:** the default workstation image tag is derived from the `package.json` version at runtime, and the release workflow checks that the git tag matches it. Once published, do not move version-specific tags; only `latest` may move.

## Architecture

```text
npm CLI (host Node.js process)
  ├─ LifecycleCoordinator — state machine (stopped/starting/running/stopping/failed);
  │    idempotent requestShutdown(); SIGINT/SIGTERM → graceful teardown
  ├─ local HTTP server: serves bundled React UI and the exercise API
  │    └─ application service → exercise engine (YAML-defined exercises, validators, lifecycle)
  ├─ WebSocket: Docker exec API TTY stream (interactive terminal, close frame on shutdown)
  ├─ kind CLI: controls isolated real Kubernetes cluster
  │    └─ kind-nodes helper — stopClusterNodes/startClusterNodes (ownership-verified via
  │         io.x-k8s.kind.cluster label); waitForClusterReady (exponential backoff poll)
  ├─ Docker CLI: pulls and creates learner workstation
  └─ management runner: allow-listed `kubectl` via docker exec, for grading and reset

Docker: kind network
  ├─ kind-featherlab-control-plane [real Kubernetes]
  └─ featherlab-workstation [non-root Linux + kubectl, no Docker socket]
```

Exercises live in `exercises/` as YAML and Markdown and are discovered automatically; grading
inspects the resulting Kubernetes state through reusable validators. See
[docs/architecture.md](docs/architecture.md) for module boundaries and
[docs/authoring.md](docs/authoring.md) for adding exercises, validators and tracks.

### API

`GET /api/exercises[?track=&level=&difficulty=&tag=]`, `GET /api/exercises/:id`,
`GET /api/exercises/:id/hints/:n`, `POST /api/exercises/:id/{activate,check,reset}`,
`GET /api/status` (v0.1 fields `ready`, `cluster`, `track`, `exercise` are unchanged; `exercises`
is the added exercise count). Errors are `{error, code}`. Requests must use a loopback `Host`
header (`127.0.0.1:<port>` or `localhost:<port>`). The v0.1 `POST /api/check` and `POST /api/reset`
remain as deprecated aliases for `k8s-0001`.

### Tests

| Command                             | What it covers                                                                                                                                                                        | Needs Docker/kind |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| `npm test`                          | Unit tests with a fake cluster, content validation, API/security, CLI exit codes, isolation guard, and a packaging test that packs the project and runs it from the unpacked tarball. | no                |
| `npm run validate-content`          | Validates every packaged exercise definition. Also a CI and release gate.                                                                                                             | no                |
| `npm run pack:check`                | Verifies the tarball contains the runtime files (including `dist/web`) and nothing else.                                                                                              | no                |
| `npm run test:kind`                 | Real exercise lifecycle against a **disposable** `featherlab-test-<id>` kind cluster.                                                                                                 | yes               |
| `npm run build && npm run test:e2e` | Playwright browser workflow (launcher → exercise → terminal → grading → reset → reconnect → failure display) against the real backend and a disposable cluster.                       | yes               |

The Docker/kind suites create and delete their own cluster, workstation and state directory, and
refuse to run against the `featherlab` cluster; your practice environment and `~/.kube/config`
are never touched. They need `FEATHERLAB_IMAGE` (for example `featherlab-workstation:dev`) when the
published image for the current version does not exist yet. A third kind cluster can exhaust the host's
inotify limit; if cluster creation fails with "Too many open files", raise
`fs.inotify.max_user_instances` (for example `sudo sysctl -w fs.inotify.max_user_instances=512`).
Locally, `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` reuses an installed Chrome; otherwise run
`npx playwright install chromium` first.

### Security constraints / limitations

See [docs/security.md](docs/security.md) for the threat model, lifecycle safety rules and the
shared cluster-admin credential limitation.

- This is a **local trusted-user application**, not a multi-tenant sandbox and not a secure hosted service. The learner holds admin credentials for the _dedicated kind training cluster_, never your existing clusters.
- Start the UI on loopback only. Do not expose it over a public tunnel or bind to a public address without auth, TLS, and additional security review.
- The CLI can control Docker on the host, so only install it from a trusted release. The learner workstation cannot access the Docker socket.
- `featherlab stop` validates the PID file by checking both the process entry-point path (`bin/featherlab.mjs`) and its start time before sending any signal. A stale PID file or a recycled PID never causes an unrelated application to be signaled.
- Only task exercises exist. No progress database, curriculum/locking engine, or CKS hardened VM labs are included yet.
- The CLI currently **requires kind installed** rather than auto-downloading its binary. This is deliberate for the first working milestone; auto-bootstrap can follow.
- The terminal uses real Docker exec TTY streams and WebSockets. Comprehensive cross-platform PTY testing and backpressure handling remain to be completed.
- The learner workstation is restarted rather than replaced between sessions. `reset` removes only the objects an exercise declares, not all user files or cluster configuration.
- Publication (GHCR push, npm trusted publishing) can only be verified by running the release workflow.

## Next increments

- Lockfile, dependency pin review, Docker image vulnerability scanning, release artifact attestation.
- Persist solved progress and problem history (SQLite).
- Guided hints, better per-check feedback, and adjustable terminal/workspace split.
- Optional kind bootstrap and robust runtime repair/update across CLI versions.
- Add tasks in tiny batches, always test each task against a fresh cluster.
