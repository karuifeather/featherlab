# Authoring guide

## Adding an exercise (content only)

No code changes are needed when the exercise uses existing validators.

1. Create a directory under `exercises/<track>/level-<n>/<NNN>-<slug>/`, using the next
   unused id. Never reuse an id: it names one learning task forever, and learners' completions
   refer to it. To move an exercise, change its `level`, `order` and prerequisites (and its
   directory), never its id, namespace or checks.
2. Add `exercise.yaml`, `description.md`, `solution.md` (private, never served) and any
   `setup/*.yaml` manifests (see below).
3. Run `npm run validate-content` and `npm test`. Invalid content fails with
   `file [property]: message` lines. `node bin/featherlab.mjs exercises` lists what loaded.
4. Add the exercise to the test scenarios (see "Testing an exercise") and run
   `npm run test:kind`, which solves every exercise for real on a disposable cluster.
5. Add it to [curriculum.md](curriculum.md) (skills matrix and sources).
6. Work through the [quality checklist](#quality-checklist) before opening a pull request.

Exercises are discovered by walking `exercises/` for `exercise.yaml`; there is no index to
edit. They ship in the npm package through the `files` entry in `package.json`, and
`npm run pack:check` fails if any file under `exercises/` is missing from the tarball.

### Schema (version 1)

```yaml
schemaVersion: 1 # required; the only supported value
id: k8s-0001 # required; unique, lowercase [a-z0-9-], <= 63 chars, stable forever
type: task # required; only "task" today
title: Your first Pod # required
summary: One-line description. # required
track: kubernetes # required; must be a registered track
level: 0 # required; integer >= 0
order: 1 # optional; position within the level (1 = first). Without it: after the
#          ordered exercises, by id. Unique per track and level.
difficulty: beginner # required; beginner | intermediate | advanced
estimatedMinutes: 5 # required
tags: [pods, kubectl] # optional
prerequisites: [k8s-0000] # optional; existing ids in the same track, no cycles

environment: # required
  profile: kind-default # must be offered by the track

content: # optional; defaults shown
  description: description.md # Markdown problem statement
  solution: solution.md # optional; PRIVATE reference solution

requirements: # required; learner-visible, inline Markdown
  - "Namespace: `fl-k8s-0001` (already created for you)" # always state the namespace first
  - "Pod name: `web`"

hints: # optional; revealed one at a time, in order
  - "`kubectl run --help` shows how to create a single Pod."

lifecycle: # track-specific; validated by the track
  namespaces: [fl-k8s-0001] # required: fl-<id>, then optional fl-<id>-<suffix>
  setup:
    manifests: [setup/web.yaml] # objects created in those namespaces on every fresh start

checks: # required; declarative, graded against real state
  - id: exists # unique within the exercise
    type: k8s.resource-in-namespace
    label: Pod web exists in namespace fl-k8s-0001 # learner-visible
    weight: 1 # optional, default 1
    hidden: false # optional; hide label/feedback in results
    params: { kind: Pod, name: web, namespace: fl-k8s-0001 }
```

Unknown properties are errors. `lifecycle.reset` (the pre-M5.1 per-object delete list) is
rejected with an explanation: namespaces replace it.

### Isolation contract

All exercises share one practice cluster, and one exercise owns it at a time. Isolation
comes from **dedicated namespaces**:

- An exercise declares the namespaces it owns in `lifecycle.namespaces`. The first is always
  `fl-<id>`; extra ones are `fl-<id>-<suffix>` (for a "wrong namespace" scenario, a legacy
  release, a sandbox). Validation rejects any other name, protected namespaces (`default`,
  `kube-*`), duplicates, and a namespace claimed by two exercises.
- Every fresh start (first open, reset, revisit, or opening after another exercise) deletes
  those namespaces and creates them again, labelled
  `app.kubernetes.io/managed-by=featherlab` and `featherlab.dev/exercise=<id>`. Then the
  setup manifests are created in them with `kubectl create`, never `apply`, so a pre-existing
  object is never silently adopted. Then the checks must report `failed` (baseline guard).
- Deleting a namespace removes **every namespaced object in it**, including ones the learner
  created that no exercise declares: stray Services, NetworkPolicies, ResourceQuotas,
  RoleBindings, ConfigMaps, Secrets.
- A namespace is deleted only after FeatherLab reads it and finds both ownership labels for
  this exact exercise. The delete is bound to the UID it read, so a namespace recreated in
  between survives. A same-named namespace without the labels is refused, before anything
  is changed, with an error that tells the learner how to remove it. FeatherLab waits
  (bounded) for the namespace to disappear and never removes finalizers.
- Reopening the exercise that already owns the cluster (reload, restart) is read-only, so
  the learner's work, including a half-finished fix, is kept.

What namespaces do **not** isolate, and what exercises must therefore not do:

1. **No cluster-scoped objects.** Setup manifests may only contain namespaced kinds placed
   in declared namespaces (`Namespace` objects are rejected: declare them instead). Level 0
   has no permitted out-of-namespace resources, so it has no extra teardown.
2. **No cluster-wide learner changes.** Do not ask the learner to label or taint nodes,
   install CRDs, change admission configuration, create ClusterRoles/Bindings, or touch
   `kube-system`. If a learner does it anyway (e.g. labels a node to "fix" scheduling),
   no reset removes it. Design the task so that this is never the intended fix, and say so
   in the description if it is tempting.
3. **Checks only look at declared namespaces.** Validation rejects a check whose
   `namespace` (or `Namespace` name) the exercise does not declare, including inside
   `any-of`/`all-of`. `k8s.resource-in-namespace` lists all namespaces only to explain where
   a misplaced object is; it passes only for the declared one.
4. **Grade objects by name, never by "anything with this label".** Relationship checks
   (`k8s.service-selects`) compare against the named workload, so a stray labelled Pod
   cannot satisfy them.
5. **Namespaces are not a security boundary.** The learner (and the grader) use the same
   cluster-admin credential. Namespaces keep exercises from interfering by accident; they
   do not stop a learner from changing anything else. See `security.md`.

Labs that change cluster-wide state (CNI, admission configuration, node changes, upgrades,
etcd, typical of CKA/CKS administration) cannot be isolated this way. They need a
disposable environment per lab (a fresh kind cluster or VM), which does not exist yet. Do
not write them as ordinary exercises.

#### Workstation files

The learner's home directory in the workstation persists across exercises (shell history,
manifests they wrote). FeatherLab never deletes it. This cannot leak a pass: a stale
manifest that names a namespace of a previous exercise fails (`namespaces "..." not found`),
and one without a namespace lands in `default`, which no check reads. Do not write checks
or setup that read files in the workstation.

#### Telling the learner where to work

The workstation's kubeconfig is mounted read-only, so `kubectl config set-context --current
--namespace=...` fails there, and FeatherLab does not rewrite it. Every exercise therefore:

- states its namespace(s) as the **first requirement**;
- explains `-n <namespace>` / `metadata.namespace` in its description (in detail in the
  first exercises, briefly later);
- uses `k8s.resource-in-namespace` for "create X" checks, so a learner who forgot `-n` is
  told where the object actually landed instead of seeing "not found".

### Multiple valid solutions

Grade the resulting state, not the commands. Prefer checks that accept every legitimate
spelling (quantities are compared numerically; probe ports may be numbers or names). Where
there are genuinely different correct end states, wrap them in `any-of`:

```yaml
- id: image
  type: any-of
  label: Uses an approved nginx image
  params:
    checks:
      - type: k8s.container-image
        params: { kind: Pod, name: web, namespace: fl-k8s-0001, image: "nginx:1.27" }
      - type: k8s.container-image
        params: { kind: Pod, name: web, namespace: fl-k8s-0001, image: "nginx:1.27-alpine" }
```

### Kubernetes validators

| Type                        | Params                                                                             | Passes when                                                                                                   |
| --------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `k8s.resource-exists`       | `kind`, `name`, `namespace` (namespaced kinds)                                     | the object exists and is not being deleted                                                                    |
| `k8s.resource-absent`       | `kind`, `name`, `namespace`                                                        | the object is gone                                                                                            |
| `k8s.resource-in-namespace` | `kind`, `name`, `namespace`                                                        | it exists there; otherwise says which namespace it is in                                                      |
| `k8s.container-image`       | `kind`, `name`, `namespace`, `image`, `container?`                                 | a (the named) container runs exactly `image`                                                                  |
| `k8s.pod-phase`             | `name`, `namespace`, `phase`                                                       | the Pod is in that phase                                                                                      |
| `k8s.pod-ready`             | `name`, `namespace`                                                                | the Pod's Ready condition is True                                                                             |
| `k8s.replicas-desired`      | `kind`, `name`, `namespace`, `replicas`                                            | `spec.replicas` matches                                                                                       |
| `k8s.replicas-available`    | `kind`, `name`, `namespace`, `replicas`                                            | `status.availableReplicas` matches                                                                            |
| `k8s.replicas-ready`        | `kind`, `name`, `namespace`, `replicas`                                            | `status.readyReplicas` matches                                                                                |
| `k8s.rollout-complete`      | `name`, `namespace`, `replicas`                                                    | a Deployment's rollout finished: generation observed, all replicas updated, none old, all available and ready |
| `k8s.container-resources`   | `kind`, `name`, `namespace`, `container`, `requests?`, `limits?` (`cpu`, `memory`) | the listed values match as quantities (`0.1` = `100m`, `64Mi` = `67108864`)                                   |
| `k8s.container-probe`       | `kind`, `name`, `namespace`, `container`, `probe`, `handler?`, `path?`             | the probe exists (with that handler/path). Pair with a readiness check                                        |
| `k8s.container-env`         | `kind`, `name`, `namespace`, `container`, `env`, `value` \| `configMapKeyRef`      | the variable is set literally, or from that ConfigMap key                                                     |
| `k8s.configmap-mounted`     | `kind`, `name`, `namespace`, `container`, `configMap`                              | that ConfigMap is a volume mounted into the container                                                         |
| `k8s.service-selects`       | `name`, `namespace`, `workload: {kind, name}`                                      | the Service has a selector matching the named workload's Pod labels and its named target ports exist          |
| `k8s.labels`                | `kind`, `name`, `namespace`, `labels` (map)                                        | the object's own labels include these                                                                         |
| `k8s.annotations`           | `kind`, `name`, `namespace`, `annotations` (map)                                   | the object's own annotations include these                                                                    |
| `all-of` / `any-of`         | `checks` (nested checks; `id`/`label` optional)                                    | all / at least one nested check passes                                                                        |

Allowed kinds live in `src/tracks/kubernetes/kinds.mjs`. A missing object is a normal
`failed` result; only a cluster that cannot be read makes a check `error` (and the grading
`incomplete`).

### Testing an exercise

Every exercise is tested three ways, and all three are required.

1. **Content validation** (`npm run validate-content`, part of `npm test`): schema,
   namespaces, setup placement, check scope, prerequisites (unknown ids, cycles, cross-track),
   duplicate ownership.
2. **Grading logic** (`test/unit/level0-content.test.mjs`): the real checks against the
   state the real setup creates, on the fake cluster. Add a scenario with `solve` (a
   converged solved state) and a `partial` solution that fails exactly the listed checks.
3. **Real Kubernetes** (`test/helpers/level0-scenarios.mjs`, run by
   `test/integration/level0-circuit.test.mjs` via `npm run test:kind`): `solve(k)` runs the
   reference solution as kubectl commands in the test workstation; `alternatives` are other
   correct solutions; `variants` are plausible mistakes, each starting from a fresh reset,
   with the exact list of checks that must fail. The harness also verifies the namespaces
   and their labels, the setup objects, a `failed` baseline, switching away (namespaces
   gone), a fresh revisit, and that the completion stays recorded. It runs on a
   `featherlab-test-<id>` cluster it creates and deletes itself.

Wait for Kubernetes conditions (`k.rollout`, `k.ready`, `k.until`), never fixed sleeps. For
a mistake whose end state is a rollout that never completes, wait until the new Pods have
had time to fail (see `settled` in the scenarios).

### Curriculum principle

**Each level evaluates only skills introduced in that level or an earlier one.** An exercise may
stretch a learner by combining familiar ideas in an unfamiliar way; it must not require an
important concept no earlier exercise taught. Before adding an exercise, list every command and
concept a correct solution needs and name the exercise that introduced each (see the
introduction column in `curriculum.md`). If one is missing, teach it first.

Content validation enforces the structural half: a prerequisite may not be at a higher level than
its dependent. The tests in `test/unit/registry.test.mjs` enforce that every Level 1+ exercise
requires the Level 0 challenge and that the challenge requires all of Level 0.

Practice comes in four modes, used in this order within a level:

| Mode                 | The learner gets                                         | Graded on               |
| -------------------- | -------------------------------------------------------- | ----------------------- |
| Guided practice      | the concept explained and the commands named             | the resulting state     |
| Independent practice | the goal and acceptance criteria; commands only in hints | the resulting state     |
| Troubleshooting      | symptoms and the target state; causes are not named      | every fault fixed       |
| Integrated mastery   | a short checklist mixing several earlier skills          | each item independently |

Repetition must change the cognitive demand (a new context, a variation, less guidance, a
combination), not just the resource names.

### Quality checklist

An exercise is ready when every item holds. Reviewers check the same list.

- [ ] **Original.** Scenario, statement, setup, hints and solution are written for FeatherLab.
      Nothing is copied from exam dumps, commercial simulators or non-permissively licensed
      material. Inspiration sources are recorded in `curriculum.md`.
- [ ] **Technically correct.** Behaviour matches the Kubernetes version FeatherLab ships
      (see `curriculum.md`, "Revalidation"), verified on the real cluster.
- [ ] **Clear objective.** The description states the situation and the observable goal;
      requirements list every graded condition, namespace first. Nothing graded is unstated.
- [ ] **No leaked answer.** The statement gives symptoms and outcomes, not commands or the
      cause. Hints are graduated: where to look, then which concept/field, then a specific
      direction. The solution is only in `solution.md`.
- [ ] **Taught before tested.** Every concept and command a solution needs was introduced
      at this level or earlier (see "Curriculum principle").
- [ ] **Appropriate difficulty and prerequisites.** The exercise builds on its prerequisites
      and adds one meaningful new demand. It is not a renamed copy of another exercise.
- [ ] **Deterministic setup.** Only pinned images used elsewhere in the circuit (see
      "Images" in `curriculum.md`); no external network beyond the image pull; no timing or
      capacity assumptions; `terminationGracePeriodSeconds` low on setup Pods.
- [ ] **Complete resource ownership.** Every object lives in a declared namespace; the
      exercise needs no cluster-scoped change; ownership is recorded in `curriculum.md`.
- [ ] **Unsolved baseline.** A fresh start is `failed` (never `incomplete`). For
      troubleshooting labs the failure is genuine Kubernetes behaviour created by setup.
- [ ] **Meaningful validators.** Checks grade outcome and health (rollout complete, Ready,
      routing), not just names or strings; independent requirements are independent checks.
- [ ] **Verified solution paths.** The reference solution and at least one alternative (where
      one exists) pass on the real cluster.
- [ ] **Negative tests.** At least one partial solution per independent requirement fails
      exactly the expected checks, on the fake cluster and on the real one.
- [ ] **Repeatable.** Switch away and back: unsolved again; completion still recorded.
- [ ] **References.** Official Kubernetes documentation links in `curriculum.md`.

## Adding a validator

1. Define it next to its siblings (Kubernetes: `src/tracks/kubernetes/validators.mjs`).
   For single-resource checks use `resourceValidator`:

   ```js
   const configMapKey = resourceValidator({
     type: "k8s.configmap-has-key",
     kinds: ["ConfigMap"],
     params: { key: { type: "string", required: true } },
     evaluate: (configMap, p, ref) => ({
       passed: p.key in (configMap.data ?? {}),
       feedback: `${describe(ref)} ${p.key in (configMap.data ?? {}) ? "has" : "lacks"} key "${p.key}".`,
     }),
   });
   ```

   Otherwise implement the contract directly: `{type, track, validateParams(params, {problems}), run(params, ctx)}`
   where `run` returns `{passed, feedback, details?}`.

2. Append it to `kubernetesValidators`.
3. Read state only through `ctx.query`. If you need a new kind of lookup, add a method to
   `KubernetesQuery` (`query.mjs`), not a `kubectl` call in the validator.
4. Feedback is shown to learners: describe what was observed, never the reference answer.
   Put diagnostics in `details` (they never leave the server).
5. Add cases to `test/unit/validators.test.mjs` or `validators-workloads.test.mjs` (pass,
   fail, missing resource, and the near-misses a learner could produce).

## Adding a track or environment profile

- **New profile for an existing track:** add its name to `profiles` in the track's `index.mjs`
  and make the driver honour it. Exercises opt in with `environment.profile`.
- **New track:** create `src/tracks/<name>/index.mjs` returning
  `{id, profiles, validators, compileLifecycle, driver}` (contract in `src/core/tracks.mjs`),
  give it a `CommandRunner` (or another adapter) for its runtime, and register it in
  `src/app.mjs`. The engine, API and UI need no changes. The `CommandRunner` contract is
  documented in `src/infrastructure/docker/workstation-runner.mjs`.
