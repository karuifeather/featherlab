# Architecture

FeatherLab separates **what an exercise is** (content), **how it is checked** (validators),
**how it is run** (lifecycle), and **how it is shown** (API and UI). Dependencies point
inward: `api -> application -> core <- tracks`, and `infrastructure` implements contracts
that `core` and `tracks` define.

```text
exercises/                 content only: YAML + Markdown (+ setup manifests)
src/
  core/                    generic engine; imports nothing outside core
    errors.mjs               structured error types with stable codes
    schema.mjs               small path-aware schema checker (no dependency)
    tracks.mjs               Track contract + TrackRegistry
    exercises/definition.mjs schema v1 + normalization of one exercise
    exercises/registry.mjs   build/validate all exercises; lookup; filter; duplicate ids
    validation/registry.mjs  ValidatorRegistry + validator contract
    validation/combinators.mjs  all-of / any-of (multiple valid solutions)
    validation/engine.mjs    run checks in isolation, weights, partial credit
    lifecycle/manager.mjs    activate / check / reset / cleanup, per-exercise lock, deadlines
  tracks/kubernetes/       everything that knows what a Pod is
    kinds.mjs                allow-list of kinds, protected namespaces
    query.mjs                read-only cluster state adapter (ctx.query)
    validators.mjs           reusable validators
    lifecycle.mjs            load-time lifecycle validation + the driver that mutates the cluster
  infrastructure/
    content/fs-loader.mjs    discovery, YAML parsing, path-confined reader
    docker/workstation-runner.mjs  CommandRunner over `docker exec`
  application/             use cases; the only place that builds public DTOs
    exercise-service.mjs
    presenters.mjs
  api/                     HTTP transport: routes, errors, static files, terminal socket
  app.mjs                  composition root: the only file that wires concrete parts together
  server.mjs               HTTP bootstrap
  infrastructure/environment.mjs  names of the cluster/workstation/state dir; injected, so tests use their own
  lib/runtime.mjs          host provisioning (kind cluster, workstation container) for one environment config
  (dependency rules are enforced by test/unit/architecture.test.mjs)
web/src/                   React UI (api client, components, features/{exercises,terminal,workspace})
```

## Key decisions

**Content is data.** An exercise is `exercise.yaml` plus `description.md`. It contains
metadata, learner-facing text, a lifecycle section, and declarative checks. It cannot contain
code: a check is `{type, params}` resolved against a registry of validators. This keeps
content reviewable, diffable and (later) safe to accept from third parties.

**Tracks are plugins behind one contract.** A track supplies profiles, validators, a
`compileLifecycle` function, and a driver (`prepare/setup/reset/cleanup/createQuery`). The core
never mentions Kubernetes. A PostgreSQL track would add `src/tracks/postgres/`, a runner for
`psql`, and one line in `app.mjs`.

**Validators read through an adapter.** `ctx.query` is track-specific. Kubernetes validators
call `ctx.query.get({kind,name,namespace})`; they never see `docker exec`. Lookups are memoized
for one grading pass, so five checks on one Pod cost one `kubectl get`.

**Failure is data.** A validator that throws becomes a `status: "error"` result; other checks
still run. An outage yields `outcome: "incomplete"` (not "wrong answer") with learner-safe
feedback. Missing resources are normal "failed" results.

**Lifecycle is idempotent and bounded.** `apply` converges, `delete --ignore-not-found` is a
no-op when objects are gone, so any partially failed operation is recovered by running it
again; errors report which step failed and which completed. Each operation has a deadline
(`AbortSignal`) and a per-exercise lock; a second concurrent operation gets HTTP 409.

**Reset is scoped.** Reset deletes exactly the objects named in `lifecycle.reset.delete`
(explicit kind/name/namespace; never selectors or `--all`), then re-applies setup. Setup
objects carry `app.kubernetes.io/managed-by=featherlab` and `featherlab.dev/exercise=<id>`;
cleanup only deletes setup objects that still carry that label.

**Public output is whitelisted.** `application/presenters.mjs` builds every response from
named fields. Checks, params, manifests, solutions, source paths, profiles and validator
diagnostics are never copied. Hints are served one at a time. Hidden checks report only
pass/fail.

## Trust and privilege boundaries

- **Exercise content is trusted in v1.** It is packaged with the CLI. Even so, the loader
  rejects path traversal, symlinks and oversized files; manifests are limited to an allow-list
  of kinds; protected namespaces (`kube-system`, `kube-public`, `kube-node-lease`) can never
  be targeted; and nothing in a definition is executed. When third-party content arrives it
  will need, at minimum: a signature/provenance step, an explicit permission model for
  lifecycle operations, and review of the allow-lists. None of that exists yet.
- **Management vs. learner privileges.** The learner's shell is an interactive TTY exec running
  as `learner`. The application's management channel is a separate non-interactive exec through
  `CommandRunner`, which can run only allow-listed binaries (`kubectl`) without a shell.
  Limitation: both currently use the workstation's cluster-admin kubeconfig for the dedicated
  practice cluster. A dedicated, narrower grader ServiceAccount is a planned hardening.
- **The host.** The Docker socket is never mounted into the workstation, the browser has no
  host shell, the server binds to `127.0.0.1`, and mutating requests and the terminal socket
  enforce the origin check.

## Lifecycle

```text
activate = prepare (cluster reachable) -> setup (apply manifests)
check    = query state -> run validators -> weighted score
reset    = prepare -> delete learner work -> re-apply setup
cleanup  = prepare -> delete learner work -> delete managed setup objects
```

## Result shape

`outcome` is `passed`, `failed`, or `incomplete` (some check could not be evaluated).
`score` is `{earned, possible, percent}` using check weights. Each check reports
`status` (`passed|failed|error`), `feedback`, and `weight`.
