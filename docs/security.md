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

- Actions are a closed set: `apply` a manifest of an allow-listed kind, `delete` a named object, `get`.
  There is no "run this command" lifecycle step; unknown `lifecycle` keys fail content validation.
- `reset.delete` entries name one object each (`kind`, `name`, `namespace`). There are no selectors,
  `--all`, or wildcards, namespaces cannot be deleted, and `kube-system`, `kube-public` and
  `kube-node-lease` are rejected.
- `cleanup` only deletes setup-created objects that still carry the `featherlab.dev/exercise=<id>` label,
  so it cannot remove a resource the learner created under the same name.
- One operation per exercise at a time (`409 OPERATION_IN_PROGRESS`); every operation has a deadline
  (`504` on timeout) and failures report which step stopped and what had completed. Every step is
  idempotent, so the remedy is to run the operation again.
- **Scope caveat:** `reset` deletes the objects an exercise declares, even if the learner created
  them for another purpose (for example their own `api` Deployment in `staging`). That is the
  definition of the exercise's scope.

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
