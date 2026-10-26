# FeatherLab

A local-first Kubernetes practice playground. **This repository is a v0.1 starter, not yet a publicly published package.** It includes the npm CLI, a Docker workstation, a real kind cluster, a React launcher, a browser terminal, and one graded Pod exercise.

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
npm install -g ./featherlab-0.1.0.tgz
FEATHERLAB_IMAGE=featherlab-workstation:dev featherlab
```

This `npm pack` approach exercises the same tarball structure users will install when published. You must build the image first as shown above.

## CLI

```bash
featherlab             # start workstation and browser UI
featherlab doctor      # check Docker daemon and kind
featherlab status      # show runtime status
featherlab reset       # delete Pod web for the starter exercise
featherlab stop        # stop the workstation, leave kind cluster intact
featherlab --help
```

Environment overrides: `FEATHERLAB_IMAGE` (default `ghcr.io/karuifeather/featherlab-workstation:0.1.0`) and `featherlab_PORT` (default 4317).

To completely remove the local lab: `featherlab stop`, then `docker rm featherlab-workstation`, `kind delete cluster --name featherlab`, and optionally delete `~/.featherlab` (this also deletes lab-specific files). **Never run these cleanup commands for clusters you wish to keep.**

## Release pipeline: test distribution from day one

One GitHub repository (`karuifeather/featherlab` assumed; change package.json and image defaults if the owner differs):

1. Push this source to the chosen public GitHub repository. GitHub Actions CI runs the JS tests, builds the frontend, and checks npm packaging.
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

7. Run the GitHub Actions **Real kind smoke test** manually to validate the full Docker → kind → browser API → grading path. This is separate from fast PR CI because it downloads a full Kubernetes node image.

**Release consistency:** `package.json` version and the pinned default image tag in `src/lib/runtime.mjs` must match every release. Later this can be generated automatically in the release build. Once published, do not move version-specific tags; only `latest` may move.

## Architecture

```text
npm CLI (host Node.js process)
  ├─ local HTTP server: serves bundled React UI and exercise APIs
  ├─ WebSocket: Docker exec API TTY stream (interactive terminal)
  ├─ kind CLI: controls isolated real Kubernetes cluster
  ├─ Docker CLI: pulls and creates learner workstation
  └─ grader: reads actual Pod JSON from kubectl

Docker: kind network
  ├─ kind-featherlab-control-plane [real Kubernetes]
  └─ featherlab-workstation [non-root Linux + kubectl, no Docker socket]
```

There is only one problem currently: create `Pod/web` in `default` using `nginx:1.27` and make it Ready. The grader checks resource name/namespace, image, phase, and Ready condition independently.

### Security constraints / v0.1 limitations

- This is a **local trusted-user application**, not a multi-tenant sandbox and not a secure hosted service. The learner holds admin credentials for the _dedicated kind training cluster_, never your existing clusters.
- Start the UI on loopback only. Do not expose it over a public tunnel or bind to a public address without auth, TLS, and additional security review.
- The CLI can control Docker on the host, so only install it from a trusted release. The learner workstation cannot access the Docker socket.
- The first level is task-only. No progress database, curriculum engine, or CKS hardened VM labs are included yet.
- The CLI currently **requires kind installed** rather than auto-downloading its binary. This is deliberate for the first working milestone; auto-bootstrap can follow.
- The terminal uses real Docker exec TTY streams and WebSockets. Comprehensive cross-platform PTY testing and backpressure handling remain to be completed.
- The learner workstation is restarted rather than replaced between sessions. `reset` removes the training Pod, not all user files or cluster configuration.
- This source has unit/syntax checks, but requires Docker and registry access to test full runtime and publication. Run the smoke workflow after pushing.

## Next increments

- Lockfile, dependency pin review, Docker image vulnerability scanning, release artifact attestation.
- Persist solved progress and problem history (SQLite) and store exercise metadata in versioned files.
- Guided hints, better per-check feedback, and adjustable terminal/workspace split.
- Optional kind bootstrap and robust runtime repair/update across CLI versions.
- Add tasks in tiny batches, always test each task against a fresh cluster.
