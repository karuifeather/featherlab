# Authoring guide

## Adding an exercise (content only)

No code changes are needed when the exercise uses existing validators.

1. Create a directory under `exercises/<track>/level-<n>/<NNN>-<slug>/`.
2. Add `exercise.yaml` and `description.md` (see below). Optionally add `solution.md`
   (private, never served) and `setup/*.yaml` manifests.
3. Run `npm test`. Invalid content fails the whole suite with `file [property]: message`
   lines. `node bin/featherlab.mjs exercises` lists what loaded.
4. Run `npm run test:kind` (needs a provisioned environment) if the exercise has setup or
   lifecycle behaviour you want proven against a real cluster.

Exercises are discovered by walking `exercises/` for `exercise.yaml`; there is no index to
edit. They ship in the npm package through the `files` entry in `package.json`.

### Schema (version 1)

```yaml
schemaVersion: 1 # required; the only supported value
id: k8s-0001 # required; unique, lowercase [a-z0-9-], <= 63 chars, stable forever
type: task # required; only "task" today
title: Your first Pod # required
summary: One-line description. # required
track: kubernetes # required; must be a registered track
level: 0 # required; integer >= 0
difficulty: beginner # required; beginner | intermediate | advanced
estimatedMinutes: 5 # required
tags: [pods, kubectl] # optional
prerequisites: [k8s-0000] # optional; must be existing exercise ids

environment: # required
  profile: kind-default # must be offered by the track

content: # optional; defaults shown
  description: description.md # Markdown problem statement
  solution: solution.md # optional; PRIVATE reference solution

requirements: # required; learner-visible, inline Markdown
  - "Pod name: `web`"

hints: # optional; revealed one at a time
  - "Try `kubectl run --help`."

lifecycle: # track-specific; validated by the track
  setup:
    manifests: [setup/namespace.yaml] # applied (idempotently) on activate/reset
  reset:
    delete: # learner-created objects removed on reset AND when another exercise is opened
      - { kind: Pod, name: web, namespace: default }

checks: # required; declarative, graded against real state
  - id: exists # unique within the exercise
    type: k8s.resource-exists
    label: Pod web exists # learner-visible
    weight: 1 # optional, default 1
    hidden: false # optional; hide label/feedback in results
    params: { kind: Pod, name: web, namespace: default }
```

Unknown properties are errors.

### Isolation contract

All exercises share one practice cluster. When a learner opens a different exercise, FeatherLab
deletes what the previous exercise _declares_ and resets the new one. Anything else the learner
created stays behind. Write exercises so that leftovers cannot change the outcome of another
exercise:

1. **Use a dedicated namespace.** Create `<exercise-slug>` (or similar) in `setup.manifests`
   and put every learner object in it. Cleanup deletes the labelled namespace and everything
   inside it, including objects you did not anticipate. Prefer this over `default` (k8s-0001
   predates this rule).
2. **Declare everything the learner creates outside it.** Every object the learner is asked to
   create in a shared namespace, and every cluster-scoped object, must be listed in
   `reset.delete`. That list is how FeatherLab clears work on reset and on a switch.
3. **Declare all setup resources.** Only objects applied from `setup.manifests` carry the
   ownership labels that cleanup uses.
4. **Do not depend on the absence of foreign objects.** Grade the objects you asked for. Avoid
   checks that a stray NetworkPolicy, ResourceQuota, LimitRange, RoleBinding or Service from
   another exercise could flip.
5. **Verify it.** An exercise that already passes right after a reset fails to open (step
   `baseline`) instead of handing out a pre-solved problem. Before publishing, solve the exercise,
   open a different one, come back, and confirm that Check fails.

Labs that change cluster-wide state (CNI, admission configuration, node changes, typical of
CKA/CKS) cannot be isolated this way. They will need a disposable environment per lab.

Multiple valid solutions: wrap alternatives in `any-of`:

```yaml
- id: image
  type: any-of
  label: Uses an approved nginx image
  params:
    checks:
      - {
          type: k8s.container-image,
          params: { kind: Pod, name: web, namespace: default, image: "nginx:1.27" },
        }
      - {
          type: k8s.container-image,
          params: { kind: Pod, name: web, namespace: default, image: "nginx:1.27-alpine" },
        }
```

### Kubernetes validators

| Type                        | Params                                                 |
| --------------------------- | ------------------------------------------------------ |
| `k8s.resource-exists`       | `kind`, `name`, `namespace` (namespaced kinds)         |
| `k8s.resource-absent`       | `kind`, `name`, `namespace`                            |
| `k8s.resource-in-namespace` | `kind`, `name`, `namespace` (says where it is instead) |
| `k8s.container-image`       | `kind`, `name`, `namespace`, `image`, `container?`     |
| `k8s.pod-phase`             | `name`, `namespace`, `phase`                           |
| `k8s.pod-ready`             | `name`, `namespace`                                    |
| `k8s.replicas-desired`      | `kind`, `name`, `namespace`, `replicas`                |
| `k8s.replicas-available`    | `kind`, `name`, `namespace`, `replicas`                |
| `k8s.replicas-ready`        | `kind`, `name`, `namespace`, `replicas`                |
| `k8s.labels`                | `kind`, `name`, `namespace`, `labels` (map)            |
| `k8s.annotations`           | `kind`, `name`, `namespace`, `annotations` (map)       |
| `all-of` / `any-of`         | `checks` (nested checks; `id`/`label` optional)        |

Allowed kinds live in `src/tracks/kubernetes/kinds.mjs`.

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
5. Add cases to `test/unit/validators.test.mjs` (pass, fail, missing resource).

## Adding a track or environment profile

- **New profile for an existing track:** add its name to `profiles` in the track's `index.mjs`
  and make the driver honour it. Exercises opt in with `environment.profile`.
- **New track:** create `src/tracks/<name>/index.mjs` returning
  `{id, profiles, validators, compileLifecycle, driver}` (contract in `src/core/tracks.mjs`),
  give it a `CommandRunner` (or another adapter) for its runtime, and register it in
  `src/app.mjs`. The engine, API and UI need no changes. The `CommandRunner` contract is
  documented in `src/infrastructure/docker/workstation-runner.mjs`.
