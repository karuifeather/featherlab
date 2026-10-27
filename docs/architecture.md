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
    persistence/             SQLite learning-progress store (M4+)
      database.mjs             DatabaseAdapter: opens SQLite, WAL mode, transaction helper
      migrate.mjs              runMigrations(): ordered, atomic schema migrations
      migrations/001-initial.mjs  first schema version (exercise_attempts, exercise_progress, resume_state)
      repositories/attempts.mjs   append-only grading attempt history
      repositories/progress.mjs   per-exercise progress aggregate (upsert)
      repositories/resume.mjs     single-row last-selected track/exercise
      index.mjs                createPersistence({ stateDir }) → { attempts, progress, resume, close }
  application/             use cases; the only place that builds public DTOs
    exercise-service.mjs
    presenters.mjs
    learning/              M4.2 progression logic; no SQL, no Kubernetes
      completion-service.mjs  pure function: compute next progress aggregate
      attempts-service.mjs    record attempt + update progress atomically
      progression-service.mjs derive lock/available/completed state from registry + DB
      resume-service.mjs      manage last selected track/exercise with fallback
  api/                     HTTP transport: routes, errors, static files, terminal socket
  app.mjs                  composition root: the only file that wires concrete parts together
  server.mjs               HTTP bootstrap
  infrastructure/environment.mjs  names of the cluster/workstation/state dir; injected, so tests use their own
  lib/runtime.mjs          host provisioning (kind cluster, workstation container) for one environment config
  (dependency rules are enforced by test/unit/architecture.test.mjs)
web/src/                   React UI (api client, components, features/{exercises,terminal,workspace})
  api/client.js              API client: listExercises, getExercise, activate, check, reset,
                               select, getTrackProgress, getResume, getVersion
  features/exercises/
    useTrackProgress.js      Fetches /api/progress/track/:id; returns progressMap, summary,
                               loading, error, refresh()
    ExerciseSidebar.jsx      Progress-aware sidebar: completed/available/locked states,
                               track summary, prerequisite explanations
    ExercisePanel.jsx        Grading + CompletionFeedback; calls onProgressUpdate on success
    CompletionFeedback.jsx   First-completion banner and Next Exercise navigation
  features/workspace/
    Workspace.jsx            Owns progress state via useTrackProgress; calls /select on pick;
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

## Learning Progression (M4.2)

Grading results are translated into durable learning records by four focused services wired
through `createApp()`. None of them know about Docker, Kubernetes, or HTTP.

**How grading becomes an attempt:**
`ExerciseService.check()` calls the lifecycle engine and records the result via
`AttemptsService.record()`. If the outcome is `"incomplete"` (infrastructure failure), nothing
is written. Otherwise, the attempt row and the progress aggregate are written in a single
`BEGIN IMMEDIATE / COMMIT` transaction — both persist or neither does.

**Completion semantics:**
An exercise is complete when its grading outcome is `"passed"` (all checks pass, no errors).
Completion is monotonic: once `completed = true`, it never reverts regardless of subsequent
outcomes. `firstCompletedAt` is set once and never overwritten. Best score is tracked as the
highest `scoreEarned` seen across all attempts; its paired `bestScorePossible` always comes
from that same attempt.

**Prerequisite format (exercise.yaml):**

```yaml
prerequisites:
  - some-exercise-id
  - another-exercise-id
```

An exercise with no `prerequisites` key is always available. The registry validates:

- Unknown IDs (no matching exercise).
- Self-dependencies (`id` listed in its own prerequisites).
- Duplicate IDs within the same prerequisites list.
- Cross-track references (not supported; each track manages its own progression).
- Dependency cycles (DFS traversal across all exercises; first cycle wins).

Invalid prerequisite graphs fail content validation at startup — no exercise is silently hidden.

**Unlock evaluation:**
`ProgressionService.getAvailability(exerciseId)` queries the progress repository once per
prerequisite and derives the availability state in memory. No extra writes occur on unlock.
States: `"locked"` (unmet prereqs), `"available"` (prereqs met or no prereqs), `"completed"`
(successful grading on record). Completed exercises can be reattempted freely.

**Lock enforcement:**
`ExerciseService.activate()` and `ExerciseService.check()` call `#assertNotLocked()` before
touching the lifecycle engine. A locked exercise returns `LockedError` (`EXERCISE_LOCKED`, 403)
with `details.unmetPrerequisites` listing the blocking IDs.

**Resume state:**
`ExerciseService.select(id)` stores the learner's current exercise via `ResumeService.select()`.
On `getResume()`: if the stored exercise is gone from the registry or is now locked, the service
returns a deterministic fallback — the first available exercise in stable registry order.

## Persistence (M4+)

Learning progress is stored in `~/.featherlab/progress.sqlite` (or `$FEATHERLAB_STATE_DIR/progress.sqlite`).
The database is opened by `createPersistence({ stateDir })` in `app.mjs` and closed on graceful shutdown.
It is never placed inside the Docker workstation or the npm package directory.

**Technology:** `node:sqlite` (built-in since Node.js 22.5; stable in Node.js 24+).
On Node.js 22.x, the `--experimental-sqlite` flag is required at runtime. On Node.js 24+ no flag is needed.

**Schema versioning:** `PRAGMA user_version` tracks the applied migration level. Each migration runs in its own `BEGIN IMMEDIATE / COMMIT` transaction, so a failed migration leaves the database at the last good version. A database written by a newer CLI (higher user_version) is refused rather than silently downgraded.

**Data safety invariants:**

- `featherlab stop` and Ctrl+C close the database cleanly (WAL frames flushed).
- Resetting an exercise never touches the SQLite file.
- Updating the npm package never deletes or overwrites an existing database.
- A corrupted or unreadable database is never silently replaced with an empty one.
- Test databases always use temporary directories; `~/.featherlab` is never touched by tests.

## Frontend Progression (M4.3)

### State ownership

`Workspace` is the authority for track progress state. It uses `useTrackProgress(trackId)` to
fetch `/api/progress/track/:id` on mount and after each successful grading pass. The hook
returns a `progressMap` (Map<exerciseId, progressInfo>), a `summary`, and a `refresh` callback.

`useTrackProgress` uses a single `setState` object updated only in async callbacks (not
synchronously in effects) to avoid cascading renders.

### Exercise selection and resume

When the user clicks a sidebar exercise, `Workspace.pick(id)` checks the `progressMap`:

- If `state === "locked"`, the click is silently ignored (locking is enforced backend-side too).
- Otherwise, `chosenId` is updated immediately (optimistic), then `POST /select` is called in
  the background to persist the resume state. Failure is non-fatal (resume just won't update).

The Launcher calls `GET /api/resume` and `GET /api/progress/track/kubernetes` on mount.
If a valid resume exists, the Kubernetes card shows "Continue Learning" with the exercise title
and completed count. Clicking it passes `initialExerciseId` through App → Workspace, which
populates `chosenId` on mount — no redundant `/select` call is made on initial render.

### Sidebar progression display

`ExerciseSidebar` receives `progressMap` and `summary` from Workspace. While progress is
loading, all exercises are treated as "available" (no flash-to-locked). Once loaded:

- `completed`: checkmark (✓) in the ordinal column, subtle tint.
- `available`: standard ordinal, normal hover behavior.
- `locked`: lock glyph (⊘), muted opacity, no hover highlight, `aria-disabled="true"`,
  prerequisite titles shown inline below the exercise title (readable on mobile, hidden in
  collapsed sidebar mode via CSS).

Locked exercises have a no-op `onClick` and retain tab focus so keyboard users can discover
their prerequisite requirements via `aria-label`.

### Completion and next-exercise navigation

After each grading pass, `ExercisePanel` inspects `result.progress`:

- `result.progress.completed && !alreadyCompletedRef.current` → first completion: sets
  `firstCompletion = true`, calls `onProgressUpdate()`.
- Repeat success: calls `onProgressUpdate()` without re-triggering the first-completion banner.

`onProgressUpdate` triggers `useTrackProgress.refresh()` which refetches track state so newly
unlocked exercises appear in the sidebar without a page reload.

`CompletionFeedback` renders below `CheckResults` on any successful grading pass:

- "Exercise completed" badge (only on first completion).
- "Next: <title> →" button pointing to the first non-locked exercise after the current one
  (computed by `findNextAvailable` in Workspace, passed as `nextExercise` prop).

### Error and recovery states

- Progress API failure: `progressMap` stays empty; all exercises treated as "available". An
  error state is returned but the workspace remains functional.
- `/select` failure: swallowed silently; exercise workspace still opens, resume just won't
  update.
- Backend unavailable during check: `result.progress` is absent; progress state is unchanged,
  no completion feedback shown.

### Progress refresh strategy

After a successful persisted grading (`result.progress` present): full track-progress refetch
via `useTrackProgress.refresh()`. This is the minimal correct fetch because newly unlocked
exercises may appear across the track, not just immediately adjacent to the just-completed one.

The Launcher refetches nothing on its own — progress is fetched once on mount. Re-entering the
workspace (returning from launcher → Kubernetes card) picks up fresh progress via the Workspace
mount.

## M4.2 API Contracts

### Extended grading response — `POST /api/exercises/:id/check`

When persistence is configured, the result object gains a `progress` field:

```json
{
  "result": {
    "exerciseId": "k8s-0001",
    "outcome": "passed",
    "success": true,
    "score": { "earned": 4, "possible": 4, "percent": 100 },
    "counts": { "total": 4, "passed": 4, "failed": 0, "errored": 0 },
    "checks": [...],
    "progress": {
      "completed": true,
      "attemptCount": 1,
      "bestScoreEarned": 4,
      "bestScorePossible": 4,
      "firstCompletedAt": "2024-01-01T00:00:00.000Z",
      "lastAttemptedAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

The `progress` field is absent when the outcome is `"incomplete"` (infra error, not recorded).

### `POST /api/exercises/:id/activate` — 403 when locked

### `POST /api/exercises/:id/select` — record exercise selection

```json
{ "trackId": "kubernetes", "exerciseId": "k8s-0001" }
```

Returns 403 if locked, 404 if not found.

### `GET /api/exercises/:id/progress` — exercise progress

```json
{
  "progress": {
    "exerciseId": "k8s-0001",
    "trackId": "kubernetes",
    "state": "completed",
    "unmetPrerequisites": [],
    "completed": true,
    "attemptCount": 2,
    "bestScoreEarned": 4,
    "bestScorePossible": 4,
    "firstCompletedAt": "...",
    "lastAttemptedAt": "..."
  }
}
```

### `GET /api/progress/track/:trackId` — track progress

```json
{
  "exercises": [
    { "exerciseId": "k8s-0001", "title": "...", "level": 0,
      "prerequisites": [], "state": "completed", "unmetPrerequisites": [],
      "completed": true, "attemptCount": 2, ... },
    { "exerciseId": "k8s-0002", "state": "available", "unmetPrerequisites": [], ... }
  ],
  "summary": { "total": 2, "completed": 1, "available": 1, "locked": 0 }
}
```

### `GET /api/resume` — resume state

```json
{
  "resume": {
    "trackId": "kubernetes",
    "exerciseId": "k8s-0001",
    "updatedAt": "2024-01-01T08:00:00.000Z",
    "fallback": false
  }
}
```

`fallback: true` means the stored selection was invalid (removed or locked); the response
contains the deterministic fallback exercise. `resume: null` when no exercises exist.

### Historical data and curriculum changes

Exercise IDs are the stable identity key. Removing an exercise from YAML does not delete its
attempts. Renaming the display title does not lose progress. An unknown `exerciseId` in the
progress table is silently ignored by progression queries; it does not crash the application.
Completion records from a previous CLI version survive a package upgrade unchanged.

## Result shape

`outcome` is `passed`, `failed`, or `incomplete` (some check could not be evaluated).
`score` is `{earned, possible, percent}` using check weights. Each check reports
`status` (`passed|failed|error`), `feedback`, and `weight`.
