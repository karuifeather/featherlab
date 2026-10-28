# Security model

FeatherLab is a single-user, local-first tool. The learner owns the machine, the Docker daemon
and the practice cluster. The goal is therefore not to defend against the learner, but to make
sure that **a web page, another local user, or exercise content cannot be turned against the
learner's machine**.

## Trust boundaries

| Boundary                       | Control                                                                                                                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Browser → local server         | Binds `127.0.0.1` only. Every request must carry `Host: 127.0.0.1:<port>` or `localhost:<port>` (DNS-rebinding defence, `403 FORBIDDEN_HOST`). Mutating requests and WebSocket upgrades also enforce `Origin`.     |
| Browser terminal → workstation | Fixed `docker exec` of `/bin/bash -l` as `learner` in the configured workstation container. The browser sends only keystrokes and a validated resize; it cannot choose container, user or command. Max 8 sessions. |
| Application → cluster          | `kubectl` only, through `docker exec` with an argument array (never a shell). Binaries are allow-listed in the runner.                                                                                             |
| Exercise content → cluster     | Content is data. Lifecycle sections accept only allow-listed kinds, valid DNS names and explicit namespaces; protected namespaces are rejected at load time. See below.                                            |
| Server → browser               | Responses are built from explicit whitelists (`src/application/presenters.mjs`). Checks, parameters, manifests, solutions, source paths, stderr and stack traces never leave the server.                           |
| Workstation container → host   | No Docker socket, no `--privileged`, `--cap-drop ALL`, `no-new-privileges`, 256 PIDs, 512 MB. Only a read-only kubeconfig is mounted.                                                                              |

## Lifecycle safety

- Actions are a closed set: create allow-listed, namespaced objects from setup manifests,
  create and delete the exercise's own namespaces, and `get`. There is no "run this command"
  lifecycle step; unknown `lifecycle` keys fail content validation.
- Every exercise declares the namespaces it owns, named `fl-<id>` or `fl-<id>-<suffix>`.
  `default`, `kube-system`, `kube-public`, `kube-node-lease`, any `kube-*` name and any
  other name are rejected at load time, as is a namespace claimed by two exercises. Setup
  manifests may contain only namespaced kinds placed in declared namespaces; checks may only
  read declared namespaces.
- **Deletion is ownership-verified.** Before a namespace is deleted, FeatherLab reads it and
  requires both `app.kubernetes.io/managed-by=featherlab` and
  `featherlab.dev/exercise=<that exercise's id>`. The delete carries a UID precondition for the
  object it verified, so a namespace that was replaced in the meantime is not deleted. A
  same-named namespace without those labels is refused before anything changes (the
  operation fails at step `ownership`, the active exercise stays intact, and the message tells
  the learner how to remove it themselves). There are no selectors, `--all`, wildcards or
  name-only deletes.
- **Termination is bounded.** After the delete, FeatherLab polls until the namespace is gone
  (default 75 s). A namespace stuck in `Terminating` fails with the conditions Kubernetes
  reports. FeatherLab never removes finalizers; the exercise stays `preparing` (not gradable)
  until the learner resolves it and retries.
- Objects are created with `kubectl create`, never `apply`, so an object that already exists
  is an error rather than silently adopted and labelled as FeatherLab's.
- Before any lifecycle operation the driver checks that the workstation's kubeconfig context is
  `kind-<configured cluster>`. A workstation pointed anywhere else fails before any command
  that could change state.
- One exercise owns the shared cluster at a time. Opening another one (after confirmation)
  deletes the previous owner's namespaces and resets the new one. A freshly reset exercise
  must grade `failed` (baseline guard), and only the ready owner can be graded
  (`409 EXERCISE_NOT_ACTIVE`). Stale state therefore cannot carry a pass into a revisited or
  different exercise.
- One operation per exercise at a time (`409 OPERATION_IN_PROGRESS`); every operation has a deadline
  (`504` on timeout) and failures report which step stopped and what had completed. Every step can
  be re-run, so the remedy is to run the operation again.

### What namespace isolation does and does not cover

| Covered                                                                                                                                                                                                    | Not covered                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Every namespaced object in an exercise's namespaces, declared or not (Pods, Deployments, Services, ConfigMaps, Secrets, NetworkPolicies, ResourceQuotas, RoleBindings, ...) is deleted on reset and switch | Cluster-scoped objects (nodes and their labels/taints, ClusterRoles, CRDs, PersistentVolumes, StorageClasses, webhook configurations) |
| Exercises never depend on objects outside their own namespaces                                                                                                                                             | Changes the learner makes in `default` or any other namespace                                                                         |
| Two exercises can use the same object names without interfering                                                                                                                                            | A learner (who has cluster-admin) deliberately changing other namespaces or cluster-wide state                                        |
| Stale work cannot satisfy a revisited exercise                                                                                                                                                             | Files in the learner's workstation home directory (never deleted, never graded)                                                       |

Namespaces are an isolation mechanism for cooperative exercises, **not a security boundary**:
the credential in the learner's terminal is cluster-admin. The current curriculum (Levels 0 to 2) is written so that no task
needs, or is helped by, a cluster-scoped change. CKA/CKS administration labs (nodes, CNI,
admission, etcd, upgrades, RBAC boundaries, runtime security) need a disposable environment per
lab, a fresh cluster or VM, which is planned and does not exist yet.

**Upgrading from 1.0 and earlier.** Those versions ran k8s-0001 in `default` (Pod `web`) and
k8s-0002 in a labelled `staging` namespace. FeatherLab never deletes them now: a Pod named
`web` in `default` may be the learner's own, and `staging` is not declared by any current
exercise. A saved "ready" record from the old layout is detected (its `fl-<id>` namespace is
missing) and the exercise is prepared again from scratch. Remove the old objects yourself if
you no longer want them: `kubectl delete pod web -n default`, `kubectl delete namespace staging`.

## Known limitation: shared cluster-admin credential

The learner's terminal and the application's grader/lifecycle driver use the **same kubeconfig**: the
kind `kubernetes-admin` client certificate (`~/.featherlab/workstation-kubeconfig`, mounted read-only
at `/home/learner/.kube/config`).

**Actual risk**

- A learner can read grading state and also forge it (for example create a Pod that satisfies a check
  without doing the exercise). This only affects the learner's own progress.
- Anything that can run commands in the workstation container has cluster-admin on the practice cluster.
  That cluster is disposable and holds no real data. The workstation joins the Docker `kind` network, so
  it can also reach the API servers of other kind clusters on the machine, but the credential is only
  valid for the practice cluster.
- The kubeconfig is `0644` inside a `0700` directory (`~/.featherlab`) so the container's UID 1000 can
  read the bind mount. Other local users cannot traverse the directory.

**Why it is not narrowed in M2**

CKA-style exercises require the learner to act as cluster-admin (RBAC, certificates, node and control-plane
work), so the learner's credential cannot be reduced without breaking the product. A separate, narrower
grader credential would only protect grading from forgery by the learner, who can already run any
`kubectl` command and edit exercise state, so it would add an RBAC subsystem (service accounts, per-exercise
roles, credential distribution into a root-only path) with no protection for the host. Revisit when
exam-mode or shared/hosted use makes grade integrity matter; at that point run grading from a
different container whose kubeconfig the learner cannot read.

## Test isolation

Integration and browser tests never use the learner's environment. `test/helpers/isolated-environment.mjs`
generates `featherlab-test-<id>` cluster and workstation names, a temporary state directory and kubeconfig,
refuses any configuration that could address the real names or `~/.featherlab` (`assertIsolated`), fails on
name collisions instead of reusing, and tears down only what it created (also on Ctrl+C). The
`test/unit/isolation.test.mjs` suite proves this with a recording fake of `docker` and `kind`.

## Reporting

Please report vulnerabilities privately to the repository owner rather than in a public issue.
