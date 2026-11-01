# Curriculum: Kubernetes track

FeatherLab teaches Kubernetes as a practical course, not an exam simulator. Concepts are
introduced one or two at a time, practised again in different situations, and only then
combined or broken on purpose. Difficulty comes from growing independence and from combining
familiar concepts, never from mechanisms the learner has not met yet.

| Level | Theme                                                            | Exercises                               | Status                         |
| ----- | ---------------------------------------------------------------- | --------------------------------------- | ------------------------------ |
| 0     | Understand and operate core resources                            | 10                                      | complete foundations course    |
| 1     | Configure and manage workloads — deployment lifecycle            | 18 (k8s-0019–0034, k8s-0003, k8s-0006)  | M5.3 complete; M5.4+ to expand |
| 2     | Configuration, health, security, and workload recovery           | 25 (k8s-0035–0053, k8s-0004–0010)       | M5.4 complete; M5.5+ to expand |
| 3     | Application patterns — init, sidecar, Jobs, CronJobs, DaemonSets | 25 (k8s-0054–0078) + 7 knowledge checks | M5.5 complete                  |
| 4     | Resource management and scheduling                               | 19 (k8s-0079–0097) + 8 knowledge checks | M5.6 complete                  |
| 5     | Services, DNS, blue/green, canary traffic                        | 27 (k8s-0098–0124) + 7 knowledge checks | M5.7 complete                  |
| 6     | Ingress, Gateway API, HTTP routing, TLS, cross-namespace routing | 26 (k8s-0125–0150) + 6 knowledge checks | M5.8 complete                  |
| 7+    | Storage, cluster administration, CKS hardening                   | none yet                                | planned                        |

All scenarios, statements, setup manifests, hints, solutions and validators are original
FeatherLab content. They are not endorsed by the CNCF and do not reproduce certification exam
questions.

## Why the curriculum was reordered

The first version of Level 0 (M5.1) went from "create a Pod" and "create a Deployment"
straight to ImagePullBackOff, readiness probes, immutable Pod fields, CrashLoopBackOff from a
ConfigMap and multi-workload recovery. Those are valuable CKA skills, but they assumed
inspection, manifests, labels, selectors and namespaces had already been learned; they had not.
The revision adds eight foundation exercises and moves the eight advanced labs to Levels 1
and 2, unchanged, behind the new Level 0 challenge.

## Stable identity and ordering

An exercise id names one learning task forever. Moving an exercise changes its `level`,
`order` (position within the level) and prerequisites, never its id, namespace or checks, so a
recorded completion keeps meaning what was actually solved. New exercises get new ids, which is
why Level 0 is not in id order: the registry sorts by track, level, `order`, then id, and the API,
launcher, sidebar and "Next exercise" all follow that order.

Learning history recorded before the revision stays as it is. Completed exercises stay
`completed` and openable wherever they moved (even behind prerequisites the learner has not
done); a stored resume selection that now points at a locked exercise falls back to the first
available one. No migration was needed.

## Level 0: foundations

| Order | ID       | Title                   | Mode                    | New concepts                                                                                | Min | Prerequisites |
| ----- | -------- | ----------------------- | ----------------------- | ------------------------------------------------------------------------------------------- | --- | ------------- |
| 1     | k8s-0001 | Your first Pod          | guided introduction     | Pod, image, `kubectl run`, `-n`, Running vs Ready                                           | 5   | none          |
| 2     | k8s-0011 | Inspect a Pod           | guided introduction     | `get`, `describe`, `logs`, labels, `kubectl label`, `--show-labels`                         | 8   | 0001          |
| 3     | k8s-0012 | Working With YAML       | guided introduction     | apiVersion/kind/metadata/spec, `kubectl apply`, container names, `--dry-run=client -o yaml` | 10  | 0001          |
| 4     | k8s-0013 | Namespaces 101          | guided introduction     | namespace scope, `-A`, `metadata.namespace`, same name twice, `kubectl delete`              | 8   | 0001          |
| 5     | k8s-0014 | Labels and Selectors    | familiar application    | selectors (`-l`), `--overwrite`, removing labels, `run --labels`                            | 10  | 0011          |
| 6     | k8s-0002 | Run a Deployment        | guided introduction     | Deployment → ReplicaSet → Pods, replicas, rollout, object vs Pod labels                     | 8   | 0012          |
| 7     | k8s-0015 | Scale an Application    | familiar application    | desired vs actual state, `kubectl scale`, scaling down                                      | 8   | 0002          |
| 8     | k8s-0016 | Managing Desired State  | independent application | changing a live object, `kubectl edit`                                                      | 10  | 0014, 0015    |
| 9     | k8s-0017 | Find the Simple Mistake | simple troubleshooting  | inspect first, list differences, fix one at a time (nothing new)                            | 12  | 0013, 0016    |
| 10    | k8s-0018 | Foundations Challenge   | mixed-skill mastery     | none: combines all of the above across two namespaces                                       | 20  | 0017          |

About 1 h 40 min in total. All are `beginner` except the challenge (`intermediate`).

Against the CNCF CKA curriculum v1.37 (checked 2026-10-27), Level 0 covers the groundwork for
"Workloads & Scheduling" (Deployments, scaling) and the inspection half of "Troubleshooting".
Levels 1 and 2 cover more of both, plus parts of "Services & Networking". Storage and cluster
administration are not covered yet.

```text
0001 ─┬─▶ 0011 ─▶ 0014 ──────────────┐
      ├─▶ 0012 ─▶ 0002 ─▶ 0015 ─▶ 0016 ┴─▶ 0017 ─▶ 0018 ─▶ Levels 1 and 2
      └─▶ 0013 ──────────────────────────────┘
```

After the first Pod, three strands open (inspection and labels, manifests and Deployments,
namespaces). They join in the troubleshooting exercise, and the challenge requires all nine
other Level 0 exercises. Every Level 1 and 2 exercise requires the challenge (enforced by
`test/unit/registry.test.mjs`).

### The new exercises

- **0011 Inspect a Pod.** Two identical-looking Pods; only `kubectl logs` reveals which one
  reported `status: needs-review`. Label that one, leave the other unlabelled, keep both
  running. Graded: the right Pod's label, the absence of the label on the other (deleting it does
  not count), both Ready.
- **0012 Working With YAML.** The description explains the four parts of a manifest and gives a
  skeleton. Create Pod `notes` with container `web` and two labels. The container name is what
  `kubectl run` alone cannot express. FeatherLab grades the resulting Pod; it does not claim to
  prove a manifest was used.
- **0013 Namespaces 101.** A `web` Pod already exists in the sandbox namespace; create another
  `web` in the main namespace, keep the sandbox one, delete only the leftover `scratch` Pod.
- **0014 Labels and Selectors.** Promote three Pods from `env=dev` to `env=prod` (needs
  `--overwrite`), remove a `debug` label, and create a fourth Pod with labels, so that
  `-l app=cart,env=prod` selects exactly the cart Pods.
- **0015 Scale an Application.** Scale one Deployment up (1 → 3) and another down (3 → 1).
  Graded: `spec.replicas` and a completed rollout (actual matches desired).
- **0016 Managing Desired State.** A healthy Deployment differs from its updated specification
  in two stated ways (replicas, an object label). Change only those; the image must not change.
- **0017 Find the Simple Mistake.** First troubleshooting, with only familiar causes and none of
  them named: the Deployment is scaled to 0, its label has a typo, and its smoke-test Pod was
  created in the sandbox namespace. The requirements give the end state, not the faults.
- **0018 Foundations Challenge.** Scale and relabel a Deployment, find a Pod by its log and label
  it, and create a Pod with a specific container name in a second namespace. No procedure given.

### How guidance decreases

| Exercises             | What the learner gets                                                     |
| --------------------- | ------------------------------------------------------------------------- |
| 0001, 0011–0013, 0002 | the concept explained, the commands named in the description, a docs link |
| 0014, 0015            | the goal and the concept; commands only in the hints                      |
| 0016                  | the target state only; the learner compares it with the live object       |
| 0017                  | symptoms and the target state; the causes are for the learner to find     |
| 0018                  | a checklist of outcomes; hints only point back at earlier exercises       |

Hints are always three steps: where to look (concept), which field or observation matters,
then specific practical direction without the full solution.

## Skill repetition

| Skill                            | Introduced | Practised again                | Applied independently | Assessed     |
| -------------------------------- | ---------- | ------------------------------ | --------------------- | ------------ |
| Pods                             | 0001       | 0011, 0012, 0013, 0014         | 0017                  | 0018         |
| Inspection (`get/describe/logs`) | 0011       | 0014, 0016                     | 0017                  | 0018         |
| Manifests (YAML, apply)          | 0012       | 0002 (optional), 0016 (`edit`) | 0018                  | 0018         |
| Namespaces                       | 0001, 0013 | every exercise                 | 0017                  | 0018         |
| Labels and selectors             | 0011, 0014 | 0002, 0016                     | 0017                  | 0018         |
| Deployments                      | 0002       | 0015, 0016                     | 0017                  | 0018         |
| Replica counts                   | 0002       | 0015, 0016                     | 0017                  | 0018         |
| Deleting the right object        | 0013       | 0014 (removing a label)        | 0017                  | n/a          |
| Simple troubleshooting           | 0017       | none                           | 0017                  | 0018 (mixed) |

Each repetition changes the demand: guided, then familiar, then independent, a variation, and
finally mixed. No exercise is a renamed copy of another.

## Level 1: deployment lifecycle (M5.3)

Sixteen new exercises cover Deployment internals, rolling updates, rollout controls and
recovery. Two pre-existing labs follow, now gated behind the Level 0 challenge.

| Order | ID       | Title                          | Difficulty   | Prerequisites   |
| ----- | -------- | ------------------------------ | ------------ | --------------- |
| 1     | k8s-0019 | Meet the ReplicaSet            | intermediate | 0018            |
| 2     | k8s-0020 | Metadata and Pod Templates     | intermediate | 0019            |
| 3     | k8s-0021 | Desired State Revisited        | intermediate | 0020            |
| 4     | k8s-0022 | Generate a Deployment Manifest | intermediate | 0021            |
| 5     | k8s-0023 | Update an Image                | intermediate | 0022            |
| 6     | k8s-0024 | Observe a Rolling Update       | intermediate | 0023            |
| 7     | k8s-0025 | Preview Before Applying        | intermediate | 0024            |
| 8     | k8s-0026 | RollingUpdate vs Recreate      | intermediate | 0025            |
| 9     | k8s-0027 | RollingUpdate Controls         | intermediate | 0026            |
| 10    | k8s-0028 | Release Metadata and History   | intermediate | 0027            |
| 11    | k8s-0029 | Pause and Resume               | intermediate | 0028            |
| 12    | k8s-0030 | Guided Rollback                | intermediate | 0029            |
| 13    | k8s-0031 | Restore the Correct Revision   | intermediate | 0030            |
| 14    | k8s-0032 | Restart, Update, or Roll Back? | intermediate | 0031            |
| 15    | k8s-0033 | Repair an Outdated Manifest    | intermediate | 0032            |
| 16    | k8s-0034 | Release Management Challenge   | advanced     | 0033            |
| 17    | k8s-0003 | Namespace Matters              | intermediate | 0018 (pre-M5.3) |
| 18    | k8s-0006 | Resource Boundaries            | intermediate | 0018 (pre-M5.3) |

## Level 2: configuration, health, security, and workload recovery (M5.4)

Nineteen new exercises introduce ConfigMaps, Secrets, multi-container patterns, workload
security fundamentals, and health probes. Six pre-existing workload recovery labs follow,
their prerequisites updated with specific M5.4 exercises.

### Circuit A — ConfigMaps (k8s-0035 to k8s-0040)

| Order | ID       | Title                           | Difficulty   | Prerequisites |
| ----- | -------- | ------------------------------- | ------------ | ------------- |
| 1     | k8s-0035 | Inject a Setting With env.value | intermediate | 0034          |
| 2     | k8s-0036 | Create and Read a ConfigMap     | intermediate | 0035          |
| 3     | k8s-0037 | Config as Environment Variables | intermediate | 0036          |
| 4     | k8s-0038 | Load All Keys With envFrom      | intermediate | 0037          |
| 5     | k8s-0039 | Mount a ConfigMap as a Volume   | intermediate | 0038          |
| 6     | k8s-0040 | Update a Live ConfigMap         | intermediate | 0039          |

### Circuit B — Secrets (k8s-0041 to k8s-0045)

| Order | ID       | Title                         | Difficulty   | Prerequisites |
| ----- | -------- | ----------------------------- | ------------ | ------------- |
| 7     | k8s-0041 | Create a Secret               | intermediate | 0040          |
| 8     | k8s-0042 | Read a Secret Value           | intermediate | 0041          |
| 9     | k8s-0043 | Inject a Secret as an Env Var | intermediate | 0042          |
| 10    | k8s-0044 | Mount a Secret as a Volume    | intermediate | 0043          |
| 11    | k8s-0045 | Image-Pull Secret Reference   | intermediate | 0044          |

### Circuit C — Multi-container Patterns & Security (k8s-0046 to k8s-0049)

| Order | ID       | Title                     | Difficulty   | Prerequisites |
| ----- | -------- | ------------------------- | ------------ | ------------- |
| 12    | k8s-0046 | Spot the Sidecar          | intermediate | 0045          |
| 13    | k8s-0047 | Add a Sidecar Container   | intermediate | 0046          |
| 14    | k8s-0048 | Drop Privilege Escalation | intermediate | 0047          |
| 15    | k8s-0049 | Read-Only Root Filesystem | intermediate | 0048          |

### Circuit D — Health Probes (k8s-0050 to k8s-0053)

| Order | ID       | Title                 | Difficulty   | Prerequisites |
| ----- | -------- | --------------------- | ------------ | ------------- |
| 16    | k8s-0050 | Add a Readiness Probe | intermediate | 0049          |
| 17    | k8s-0051 | Add a Liveness Probe  | intermediate | 0050          |
| 18    | k8s-0052 | Tune Probe Timings    | intermediate | 0051          |
| 19    | k8s-0053 | Fix a Broken Probe    | intermediate | 0052          |

### Pre-existing workload recovery labs (k8s-0004 to k8s-0010)

These are the M5.1 labs, moved with ids, namespaces, setup, checks and hints unchanged.
New prerequisites were added in M5.4: k8s-0008 now requires k8s-0039 (ConfigMap volumes);
k8s-0005 now requires k8s-0051 (liveness probes).

| Order | ID       | Title                     | Difficulty   | Prerequisites          |
| ----- | -------- | ------------------------- | ------------ | ---------------------- |
| 20    | k8s-0004 | The Wrong Image           | intermediate | 0018                   |
| 21    | k8s-0005 | Why Isn't It Ready?       | intermediate | 0004, 0051             |
| 22    | k8s-0007 | Recreate, Don't Patch     | intermediate | 0003                   |
| 23    | k8s-0008 | The Crashing Container    | intermediate | 0004, 0039             |
| 24    | k8s-0009 | Two Broken Workloads      | advanced     | 0005, 0008             |
| 25    | k8s-0010 | Workload Recovery Mastery | advanced     | 0003, 0006, 0007, 0009 |

A prerequisite may never sit at a higher level than its dependent (content validation rejects
it). The Level 2 entry exercises require k8s-0034 (the Level 1 mastery lab); the recovery labs
still require the Level 0 foundations challenge.

Deliberately deferred to later levels: Services in depth, scheduling (affinity, taints), storage,
NetworkPolicy, RBAC, cluster administration (kubeadm, etcd, upgrades), and CKS hardening.

## Level 3: application patterns (M5.5)

Twenty-five exercises cover init containers, native sidecar containers, Jobs and their retry
controls, CronJobs, and DaemonSets. Seven interleaved knowledge checks cover the conceptual
side of each topic.

### Circuit A — Temporary Pods and Init Containers (k8s-0054 to k8s-0060)

| Order | ID        | Title                               | Difficulty   | Prerequisites |
| ----- | --------- | ----------------------------------- | ------------ | ------------- |
| 1     | k8s-0054  | Run a One-Time Pod                  | intermediate | 0053          |
| 2     | k8s-0055  | Inspect a Completed Task            | intermediate | 0054          |
| 3     | k8s-0056  | Fix a Startup Command               | intermediate | 0055          |
| 3.5   | kq-l3-001 | Temporary Pods and Restart Policies | — (check)    | 0056          |
| 5     | k8s-0057  | Initialize Before Starting          | intermediate | 0056          |
| 6     | k8s-0058  | Prepare Shared Files                | intermediate | 0057          |
| 7     | k8s-0059  | Diagnose Failed Initialization      | intermediate | 0058          |
| 8     | k8s-0060  | Application Startup Challenge       | intermediate | 0059          |
| 8.5   | kq-l3-002 | Init Containers and Shared Volumes  | — (check)    | 0059          |

### Circuit B — Native Sidecars (k8s-0061 to k8s-0064)

| Order | ID        | Title                                | Difficulty   | Prerequisites |
| ----- | --------- | ------------------------------------ | ------------ | ------------- |
| 9     | k8s-0061  | A Supporting Container               | intermediate | 0060          |
| 10    | k8s-0062  | Sidecar and Shared Files             | intermediate | 0061          |
| 11    | k8s-0063  | Startup Ordering with Native Sidecar | intermediate | 0062          |
| 12    | k8s-0064  | Repair the Native Sidecar            | intermediate | 0063          |
| 12.5  | kq-l3-003 | Native Sidecars                      | — (check)    | 0063          |

### Circuit C — Jobs (k8s-0065 to k8s-0069)

| Order | ID        | Title                                | Difficulty   | Prerequisites |
| ----- | --------- | ------------------------------------ | ------------ | ------------- |
| 13    | k8s-0065  | Your First Job                       | intermediate | 0064          |
| 14    | k8s-0066  | Job Status and Logs                  | intermediate | 0065          |
| 15    | k8s-0067  | Recover a Failed Job                 | intermediate | 0066          |
| 16    | k8s-0068  | Multiple Completions and Parallelism | intermediate | 0067          |
| 17    | k8s-0069  | Retry and Deadline Controls          | intermediate | 0068          |
| 17.5  | kq-l3-004 | Kubernetes Jobs                      | — (check)    | 0068          |
| 17.8  | kq-l3-005 | Indexed Jobs                         | — (check)    | 0068          |

### Circuit D — CronJobs (k8s-0070 to k8s-0073)

| Order | ID        | Title                              | Difficulty   | Prerequisites |
| ----- | --------- | ---------------------------------- | ------------ | ------------- |
| 18    | k8s-0070  | Create a Scheduled Job             | intermediate | 0069          |
| 19    | k8s-0071  | Run the Template Now               | intermediate | 0070          |
| 20    | k8s-0072  | Suspend and Maintain a CronJob     | intermediate | 0071          |
| 21    | k8s-0073  | Restore a Suspended CronJob        | intermediate | 0072          |
| 21.5  | kq-l3-006 | CronJob Scheduling and Maintenance | — (check)    | 0072          |

### Circuit E — DaemonSets and mastery (k8s-0074 to k8s-0078)

| Order | ID        | Title                         | Difficulty   | Prerequisites |
| ----- | --------- | ----------------------------- | ------------ | ------------- |
| 22    | k8s-0074  | Meet the DaemonSet            | intermediate | 0073          |
| 23    | k8s-0075  | Maintain a Node-Local Helper  | intermediate | 0074          |
| 24    | k8s-0076  | Observe DaemonSet Scheduling  | intermediate | 0075          |
| 25    | k8s-0077  | Choose the Correct Controller | intermediate | 0076          |
| 26    | k8s-0078  | Application Patterns Mastery  | intermediate | 0077          |
| 26.5  | kq-l3-007 | Level 3 Mixed Review          | — (check)    | 0077          |

## Level 4: resource management and scheduling (M5.6)

Nineteen exercises cover resource requests and limits, QoS classes, LimitRange, ResourceQuota,
node selectors, node affinity, pod anti-affinity, HPA configuration, and scheduling diagnostics.
Eight interleaved knowledge checks cover the conceptual side of each topic.

### Circuit A — Resource Requests and Limits (k8s-0079 to k8s-0081)

| Order | ID        | Title                                 | Difficulty   | Prerequisites |
| ----- | --------- | ------------------------------------- | ------------ | ------------- |
| 1     | k8s-0079  | Your First Resource Request           | beginner     | 0078          |
| 2     | k8s-0080  | CPU and Memory Units                  | beginner     | 0079          |
| 3     | k8s-0081  | Per-Container Budgets                 | intermediate | 0080          |
| 3.5   | kq-l4-001 | Resource Units and Requests vs Limits | — (check)    | 0081          |

### Circuit B — QoS, ResourceQuota, LimitRange (k8s-0082 to k8s-0086)

| Order | ID        | Title                         | Difficulty   | Prerequisites |
| ----- | --------- | ----------------------------- | ------------ | ------------- |
| 4     | k8s-0082  | QoS Classes                   | intermediate | 0081          |
| 5     | k8s-0083  | Budget a Namespace            | intermediate | 0082          |
| 6     | k8s-0084  | Why Was Creation Rejected?    | intermediate | 0083          |
| 6.5   | kq-l4-002 | QoS and Resource Policy       | — (check)    | 0084          |
| 7     | k8s-0085  | Default Resource Limits       | intermediate | 0084          |
| 8     | k8s-0086  | Repair a Constrained Workload | intermediate | 0085          |

### Circuit C — Node Inspection and Placement (k8s-0087 to k8s-0089)

| Order | ID        | Title                        | Difficulty   | Prerequisites |
| ----- | --------- | ---------------------------- | ------------ | ------------- |
| 9     | k8s-0087  | A Pod's Node Assignment      | beginner     | 0086          |
| 10    | k8s-0088  | Select an Eligible Node      | intermediate | 0087          |
| 11    | k8s-0089  | Repair a Pending Deployment  | intermediate | 0088          |
| 11.5  | kq-l4-003 | Node Labels and nodeSelector | — (check)    | 0089          |
| 12    | kq-l4-004 | Taints and Tolerations       | — (check)    | 0089          |

### Circuit E — Node Affinity (k8s-0090 to k8s-0093)

| Order | ID        | Title                           | Difficulty   | Prerequisites |
| ----- | --------- | ------------------------------- | ------------ | ------------- |
| 12    | k8s-0090  | Required Node Affinity          | intermediate | 0089          |
| 13    | k8s-0091  | Preferred Node Affinity         | intermediate | 0090          |
| 14    | k8s-0092  | Pod Anti-Affinity for Spread    | intermediate | 0091          |
| 15    | k8s-0093  | Diagnose an Unschedulable Pod   | intermediate | 0092          |
| 15.5  | kq-l4-005 | Node Affinity and Anti-Affinity | — (check)    | 0093          |

### Circuit G — HPA and Mastery (k8s-0094 to k8s-0097)

| Order | ID        | Title                       | Difficulty   | Prerequisites |
| ----- | --------- | --------------------------- | ------------ | ------------- |
| 16    | k8s-0094  | Your First HPA              | intermediate | 0093          |
| 17    | k8s-0095  | HPA with CPU Policy         | intermediate | 0094          |
| 17.5  | kq-l4-006 | HPA and Autoscaling         | — (check)    | 0095          |
| 18    | k8s-0096  | Investigate a Pending Pod   | intermediate | 0095          |
| 19    | k8s-0097  | Master Scheduling Placement | advanced     | 0096          |
| 19.5  | kq-l4-007 | Resource Management Review  | — (check)    | 0097          |
| 20    | kq-l4-008 | Scheduler Diagnostics       | — (check)    | 0097          |

### Deferred topics

Intentionally deferred to avoid unsafe cluster mutations on the single-node kind cluster:

- **Live taint/toleration exercises** — tainting the kind control-plane node would block unrelated exercises. Covered as knowledge checks (kq-l4-004) instead.
- **HPA behavioral scaling** — requires metrics-server, which is not installed in the default kind setup. HPA exercises grade configuration only (object existence + spec fields).
- **TopologySpreadConstraints** — requires multiple nodes. Conceptually adjacent to anti-affinity; deferred.
- **PriorityClass and preemption** — requires a workload that gets preempted; safely testable only with dedicated priority nodes.

## Level 5: services, DNS and traffic routing (M5.7)

Twenty-seven exercises cover ClusterIP, NodePort, LoadBalancer, ExternalName, named ports,
selector repair, EndpointSlices, readiness, DNS resolution, cross-namespace DNS, headless
Services, blue/green deployment, canary traffic, and DNS troubleshooting. Seven interleaved
knowledge checks cover the conceptual side of each topic.

### Circuit A — ClusterIP Fundamentals (k8s-0098 to k8s-0103)

| Order | ID        | Title                          | Difficulty   | Prerequisites |
| ----- | --------- | ------------------------------ | ------------ | ------------- |
| 1     | k8s-0098  | Your First Service             | beginner     | 0097          |
| 2     | k8s-0099  | Connect to a Service           | intermediate | 0098          |
| 3     | k8s-0100  | Service Ports                  | intermediate | 0099          |
| 4     | k8s-0101  | Named Ports                    | intermediate | 0100          |
| 5     | k8s-0102  | Repair a Selector              | intermediate | 0101          |
| 6     | k8s-0103  | Service Fundamentals Challenge | advanced     | 0102          |
| 6.5   | kq-l5-001 | Service Fundamentals           | — (check)    | 0103          |

### Circuit B — EndpointSlices and Backend Readiness (k8s-0104 to k8s-0108)

| Order | ID        | Title                        | Difficulty   | Prerequisites |
| ----- | --------- | ---------------------------- | ------------ | ------------- |
| 7     | k8s-0104  | Find the Backends            | intermediate | 0103          |
| 8     | k8s-0105  | Multiple Backends            | intermediate | 0104          |
| 9     | k8s-0106  | Readiness Matters            | intermediate | 0105          |
| 10    | k8s-0107  | Empty EndpointSlice          | intermediate | 0106          |
| 11    | k8s-0108  | Restore a Broken Service     | advanced     | 0107          |
| 11.5  | kq-l5-002 | EndpointSlices and Readiness | — (check)    | 0108          |

### Circuit C — DNS (k8s-0109 to k8s-0113)

| Order | ID        | Title                        | Difficulty   | Prerequisites |
| ----- | --------- | ---------------------------- | ------------ | ------------- |
| 12    | k8s-0109  | Resolve a Service            | intermediate | 0108          |
| 13    | k8s-0110  | Reach Another Namespace      | intermediate | 0109          |
| 14    | k8s-0111  | DNS Search Paths             | intermediate | 0110          |
| 15    | k8s-0112  | Headless Service             | intermediate | 0111          |
| 16    | k8s-0113  | ExternalName Service         | intermediate | 0112          |
| 16.5  | kq-l5-003 | DNS and Namespace Resolution | — (check)    | 0113          |

### Circuit D — Service Types (k8s-0114 to k8s-0115)

| Order | ID        | Title                        | Difficulty   | Prerequisites |
| ----- | --------- | ---------------------------- | ------------ | ------------- |
| 17    | k8s-0114  | NodePort Configuration       | intermediate | 0113          |
| 18    | k8s-0115  | Service Type Troubleshooting | intermediate | 0114          |
| 18.5  | kq-l5-004 | Service Types and Exposure   | — (check)    | 0115          |

### Circuit E — Blue/Green Deployment (k8s-0116 to k8s-0119)

| Order | ID        | Title                     | Difficulty   | Prerequisites |
| ----- | --------- | ------------------------- | ------------ | ------------- |
| 19    | k8s-0116  | Two Versions, One Service | intermediate | 0115          |
| 20    | k8s-0117  | Switch to Green           | intermediate | 0116          |
| 21    | k8s-0118  | Roll Back to Blue         | intermediate | 0117          |
| 22    | k8s-0119  | Broken Release Recovery   | advanced     | 0118          |
| 22.5  | kq-l5-005 | Blue/Green Deployment     | — (check)    | 0119          |

### Circuit F — Canary Traffic (k8s-0120 to k8s-0122)

| Order | ID        | Title                 | Difficulty   | Prerequisites |
| ----- | --------- | --------------------- | ------------ | ------------- |
| 23    | k8s-0120  | Configure a Canary    | intermediate | 0119          |
| 24    | k8s-0121  | Observe Both Versions | intermediate | 0120          |
| 25    | k8s-0122  | Promote or Roll Back  | advanced     | 0121          |
| 25.5  | kq-l5-006 | Canary Traffic        | — (check)    | 0122          |

### Circuit G — DNS Troubleshooting and Mastery (k8s-0123 to k8s-0124)

| Order | ID        | Title                    | Difficulty | Prerequisites |
| ----- | --------- | ------------------------ | ---------- | ------------- |
| 26    | k8s-0123  | Debug DNS                | advanced   | 0122          |
| 27    | k8s-0124  | Services and DNS Mastery | advanced   | 0123          |
| 27.5  | kq-l5-007 | Level 5 Mixed Review     | — (check)  | 0124          |

### Deferred topics

- **LoadBalancer Services** — require a cloud provider or MetalLB, neither of which is present in the single-node kind cluster. Covered conceptually in kq-l5-004.
- **NetworkPolicy** — cluster-level networking; requires a CNI that enforces policies (kind default does not). Deferred.
- **EndpointSlice manual creation** — EndpointSlices are controller-managed; exercises observe but never create them.

## Level 6: Ingress, Gateway API, HTTP routing (M5.8)

Twenty-six exercises cover Kubernetes Ingress (Traefik v3), Gateway API (GatewayClass, Gateway,
HTTPRoute), HTTP matching by path, header and hostname, HTTP redirects, TLS termination, cross-
namespace routing with ReferenceGrant, and weighted backendRef traffic splitting. Six interleaved
knowledge checks cover the conceptual side of each topic.

All Level 6 exercises use the `kind-routing` environment profile, which starts a kind cluster with
Traefik v3 and the standard-channel Gateway API CRDs pre-installed in `traefik-system`. Routing
probes (`k8s.routing-probe`) send curl from a `grader-client` Pod to
`traefik.traefik-system.svc.cluster.local` with a controlled `Host` header; learner-supplied
hostnames are never used as network targets.

### Circuit A — Kubernetes Ingress (k8s-0125 to k8s-0129)

| Order | ID        | Title                           | Difficulty   | Prerequisites |
| ----- | --------- | ------------------------------- | ------------ | ------------- |
| 1     | k8s-0125  | Your First Ingress              | beginner     | 0124          |
| 2     | k8s-0126  | Route by Hostname               | intermediate | 0125          |
| 3     | k8s-0127  | Route by Path                   | intermediate | 0126          |
| 4     | k8s-0128  | Fix the Backend                 | intermediate | 0127          |
| 5     | k8s-0129  | Ingress Routing Troubleshooting | intermediate | 0128          |
| 5.5   | kq-l6-001 | Ingress Fundamentals            | — (check)    | 0129          |

### Circuit B — Gateway API (k8s-0130 to k8s-0135)

| Order | ID        | Title                         | Difficulty   | Prerequisites |
| ----- | --------- | ----------------------------- | ------------ | ------------- |
| 6     | k8s-0130  | Inspect the GatewayClass      | beginner     | 0129          |
| 7     | k8s-0131  | Your First Gateway Route      | intermediate | 0130          |
| 8     | k8s-0132  | Hostname Routing with Gateway | intermediate | 0131          |
| 9     | k8s-0133  | Path-Based Routing            | intermediate | 0132          |
| 10    | k8s-0134  | Route Attachment              | intermediate | 0133          |
| 11    | k8s-0135  | Gateway Status Diagnostics    | intermediate | 0134          |
| 11.5  | kq-l6-002 | Gateway API Architecture      | — (check)    | 0135          |

### Circuit C — HTTP Matching (k8s-0136 to k8s-0139)

| Order | ID        | Title                     | Difficulty   | Prerequisites |
| ----- | --------- | ------------------------- | ------------ | ------------- |
| 12    | k8s-0136  | Match the Correct Path    | intermediate | 0135          |
| 13    | k8s-0137  | Route by Request Header   | intermediate | 0136          |
| 14    | k8s-0138  | HTTP Redirect             | intermediate | 0137          |
| 15    | k8s-0139  | Repair a Routing Conflict | advanced     | 0138          |
| 15.5  | kq-l6-003 | TLS and HTTPS             | — (check)    | 0139          |

### Circuit D — TLS (k8s-0140 to k8s-0143)

| Order | ID       | Title                    | Difficulty   | Prerequisites |
| ----- | -------- | ------------------------ | ------------ | ------------- |
| 16    | k8s-0140 | HTTPS with Ingress       | intermediate | 0139          |
| 17    | k8s-0141 | HTTPS with Gateway       | intermediate | 0140          |
| 18    | k8s-0142 | Fix a TLS Configuration  | intermediate | 0141          |
| 19    | k8s-0143 | Secure Routing Challenge | advanced     | 0142          |

### Circuit E — Cross-Namespace Routing (k8s-0144 to k8s-0147)

| Order | ID        | Title                               | Difficulty   | Prerequisites |
| ----- | --------- | ----------------------------------- | ------------ | ------------- |
| 20    | k8s-0144  | Route Across Namespaces             | intermediate | 0143          |
| 21    | k8s-0145  | Inspect the Cross-Namespace Failure | intermediate | 0144          |
| 22    | k8s-0146  | Multi-Backend Cross-Namespace       | intermediate | 0145          |
| 23    | k8s-0147  | Cross-Namespace Routing Mastery     | intermediate | 0146          |
| 23.5  | kq-l6-004 | Cross-Namespace Routing             | — (check)    | 0147          |

### Circuit F — Weighted Routing and Mastery (k8s-0148 to k8s-0150)

| Order | ID        | Title                      | Difficulty   | Prerequisites |
| ----- | --------- | -------------------------- | ------------ | ------------- |
| 24    | k8s-0148  | Configure Canary HTTPRoute | intermediate | 0147          |
| 25    | k8s-0149  | Promote Canary             | advanced     | 0148          |
| 25.5  | kq-l6-005 | Weighted Traffic Splitting | — (check)    | 0149          |
| 25.8  | kq-l6-006 | Level 6 Mixed Review       | — (check)    | 0149          |
| 26    | k8s-0150  | Level 6 Routing Mastery    | advanced     | 0149          |

### Deferred topics

- **mTLS and advanced TLS policies** — require cert-manager or OPA/policy controllers; out of scope for the single-node kind setup.
- **Ingress annotations** — controller-specific and fragile across Traefik versions; Gateway API filters cover the same use cases more portably.
- **TCPRoute and GRPCRoute** — Gateway API extension resources; not included in the standard channel v1.2.1 CRDs.
- **NetworkPolicy** — continues to be deferred; see Level 5 deferred topics.

## Ownership, setup and reset

Every exercise owns only namespaced objects in its declared namespaces (`fl-<id>`,
`fl-<id>-<suffix>`). A fresh start (first open, reset, revisit) deletes those namespaces after
verifying their ownership labels and recreates them from setup, which removes everything in
them. No exercise has resources outside its namespaces.

| ID   | Namespaces                       | Setup (initial state)                                                                     |
| ---- | -------------------------------- | ----------------------------------------------------------------------------------------- |
| 0001 | fl-k8s-0001                      | empty                                                                                     |
| 0011 | fl-k8s-0011                      | Pods `alpha` (log `status: ok`) and `bravo` (log `status: needs-review`)                  |
| 0012 | fl-k8s-0012                      | empty                                                                                     |
| 0013 | fl-k8s-0013, fl-k8s-0013-sandbox | Pods `web` and `scratch` in the sandbox                                                   |
| 0014 | fl-k8s-0014                      | Pods `cart-a`, `cart-b` (`env=dev`) and `search-a` (`env=dev`, `debug=true`)              |
| 0002 | fl-k8s-0002                      | empty                                                                                     |
| 0015 | fl-k8s-0015                      | Deployments `frontend` (1 replica) and `worker` (3)                                       |
| 0016 | fl-k8s-0016                      | Deployment `reports` (1 replica, `app=reports`)                                           |
| 0017 | fl-k8s-0017, fl-k8s-0017-sandbox | Deployment `greeter` (0 replicas, label `app=greter`); Pod `greeter-check` in the sandbox |
| 0018 | fl-k8s-0018, fl-k8s-0018-tools   | Deployment `shop` (1 replica, `env=staging`); Pods `batch-1`, `batch-2` with owner logs   |
| 0003 | fl-k8s-0003, fl-k8s-0003-sandbox | Service `catalog`; Deployment `catalog` and Pod `notes` in the sandbox                    |
| 0006 | fl-k8s-0006                      | Deployment `ledger` with containers `app` and `metrics`                                   |
| 0004 | fl-k8s-0004                      | Deployment `storefront` with image `nginx:1.27.99` (unpublished)                          |
| 0005 | fl-k8s-0005                      | Deployment `status-page` with a readiness probe on port 8080; Service                     |
| 0007 | fl-k8s-0007                      | bare Pod `audit-log` (`LOG_LEVEL=info`); Service                                          |
| 0008 | fl-k8s-0008                      | ConfigMap `gateway-config` with a typo; Deployment `gateway` mounting it                  |
| 0009 | fl-k8s-0009                      | `orders` with a mistyped Service selector; `payments` referencing a missing ConfigMap     |
| 0010 | fl-k8s-0010, fl-k8s-0010-legacy  | `inventory-api` (bad tag, probe on a missing port) and Service; legacy Deployment         |

## Validators and known limitations

Grading reads cluster state, never command history, so imperative and declarative solutions
both pass. Workload health is graded with `k8s.rollout-complete` (all replicas updated, none
old, all available) rather than "some Pods are available". Routing is graded against the
named workload (`k8s.service-selects`), so a stray labelled Pod never counts.

Known limits, deliberately accepted:

- `k8s.container-env` reads `env`. A variable supplied through `envFrom` does not satisfy it.
- `k8s.container-image` compares image strings: `nginx:1.27@sha256:...` or `docker.io/library/nginx:1.27`
  do not count as `nginx:1.27`.
- `k8s.container-probe` proves a probe exists (with the required handler and path). That it
  works is proven by the readiness/rollout check next to it.
- 0008 grades that the ConfigMap is mounted and that `/healthz`, which only that
  configuration serves, makes the Pods Ready. It does not diff the configuration file.
- The learner and the grader share one cluster-admin credential (see `security.md`). A
  determined learner can forge a passing state; that only affects their own progress.

## Testing evidence

Every exercise has the three layers required by `authoring.md`:

- **Content validation** — `npm run validate-content` (53 exercises, 19 knowledge checks).
- **Fake-cluster grading tests** — `test/unit/level0-content.test.mjs` (all Level 0 exercises),
  `test/unit/validators-workloads.test.mjs` (all Level 2 recovery labs), and
  `test/unit/validators.test.mjs` (460 validator cases total, covering all M5.4 validators).
- **Real-kind circuit** — `test/integration/level0-circuit.test.mjs` with scenarios in
  `test/helpers/level0-scenarios.mjs` (all 34 pre-M5.4 exercises); M5.4 exercises pending
  real-kind circuit authoring.
- **Compatibility** — `test/unit/learning/curriculum-compat.test.mjs` verifies pre-revision
  learning history survives M5.4 prerequisite additions.

The circuit covers, per exercise:

- **Baseline:** the fresh state grades `failed`.
- **Solution:** the reference solution passes.
- **Alternatives:** where they exist, other correct solutions pass. Examples: a declarative
  manifest for 0001, a named probe port for 0005, equivalent quantity spellings for 0006.
- **Variants:** every partial or incorrect solution fails exactly the listed checks.
- **Repeatability:** switching away removes the namespaces; a revisit is unsolved again; the
  completion stays recorded.

## Sources

### Authoritative references

- CNCF CKA certification: <https://www.cncf.io/training/certification/cka/>, and the curriculum
  v1.37 in <https://github.com/cncf/curriculum>.
- CNCF CKS certification: <https://www.cncf.io/training/certification/cks/> (curriculum v1.34 in
  the same repository; not covered by Level 0).
- Kubernetes documentation per topic:
  - Pods: <https://kubernetes.io/docs/concepts/workloads/pods/>
  - Pod lifecycle and container states: <https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/>
  - Namespaces: <https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/>
    and <https://kubernetes.io/docs/tasks/administer-cluster/namespaces/>
  - Labels and selectors: <https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/>
  - Deployments: <https://kubernetes.io/docs/concepts/workloads/controllers/deployment/>
  - Images: <https://kubernetes.io/docs/concepts/containers/images/>
  - Probes: <https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/>
  - Resources:
    - <https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/>
    - <https://kubernetes.io/docs/tasks/configure-pod-container/assign-cpu-resource/>
    - <https://kubernetes.io/docs/tasks/configure-pod-container/assign-memory-resource/>
    - Quantities: <https://kubernetes.io/docs/reference/kubernetes-api/common-definitions/quantity/>
  - ConfigMaps: <https://kubernetes.io/docs/concepts/configuration/configmap/> and
    <https://kubernetes.io/docs/tasks/configure-pod-container/configure-pod-configmap/>
  - Services and EndpointSlices: <https://kubernetes.io/docs/concepts/services-networking/service/>
    and <https://kubernetes.io/docs/concepts/services-networking/endpoint-slices/>
  - Debugging:
    - <https://kubernetes.io/docs/tasks/debug/debug-application/debug-pods/>
    - <https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod/>
    - <https://kubernetes.io/docs/tasks/debug/debug-application/determine-reason-pod-failure/>
    - <https://kubernetes.io/docs/tasks/debug/debug-application/debug-service/>
  - Changing and replacing objects:
    - <https://kubernetes.io/docs/tasks/run-application/update-api-object-kubectl-patch/>
    - <https://kubernetes.io/docs/reference/kubectl/generated/kubectl_replace/>
    - <https://kubernetes.io/docs/reference/kubectl/quick-reference/>
  - Finalizers (namespace deletion behaviour): <https://kubernetes.io/docs/concepts/overview/working-with-objects/finalizers/>

All links were checked on 2026-10-27.

### Inspiration (topic coverage only; no text, manifests or questions reused)

| Repository                                                                                                                        | License (checked 2026-10-27)                   | How it was used                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| [dgkanatsios/CKAD-exercises](https://github.com/dgkanatsios/CKAD-exercises)                                                       | MIT                                            | Topic list (core concepts, pod design, configuration, observability, services) compared against Level 0 coverage    |
| [jayendrapatil/kubernetes-exercises](https://github.com/jayendrapatil/kubernetes-exercises)                                       | MIT                                            | Topic list (pods, deployments, namespaces, labels, probes, configmaps, debugging) compared against Level 0 coverage |
| [theplatformlab/CKA-Certified-Kubernetes-Administrator](https://github.com/theplatformlab/CKA-Certified-Kubernetes-Administrator) | MIT                                            | Repository structure (domains, exercises, diagnostics) reviewed for the domain mapping                              |
| [chadmcrowell/CKA-Exercises](https://github.com/chadmcrowell/CKA-Exercises)                                                       | none declared (all rights reserved by default) | Not used beyond its public topic headings; nothing reproduced                                                       |
| [techiescamp/cka-certification-guide](https://github.com/techiescamp/cka-certification-guide)                                     | "All Rights Reserved"                          | Not used; nothing reproduced                                                                                        |

No exercise text or manifest was taken from any of them. If future content adapts material
from the MIT-licensed repositories, keep their copyright notice and record the specific source
here.

## Revalidation

Re-run `npm run test:kind` and review this section whenever any of these change:

- **Images.** Every exercise uses `nginx:1.27` from Docker Hub. The 1.27 branch is end of life
  and the tag is frozen at 1.27.5; on 2026-10-27 it resolved to the OCI index
  `sha256:6784fb0834aa7dbbe12e3d7471e69c290df3e6ba810dc38b34ae33d3c1c05f7d`. Learner-facing
  images stay human-readable tags because the learner types and copies them. If the tag ever
  moves, pin setup images by digest and accept the digest form in the image checks.
- **Entrypoint override.** The log-reading Pods in 0011 and 0018 run
  `sh -c "echo ...; exec sleep infinity"` in the `nginx:1.27` image, so their log is exactly one
  meaningful line (nginx itself prints a startup line per CPU, which buried it). This relies on
  the image containing `sh` and `sleep`.
- **Deliberately broken references.** `nginx:1.27.99` (0004) and `nginx:1.27-alpne` (0010)
  must stay unpublished tags of the official image. Never use a misspelled repository name:
  someone could publish it.
- **Kubernetes version.** Verified on kind node `v1.37.0` (`src/lib/runtime.mjs`) with kubectl
  `v1.37.1` in the workstation. Behaviours the exercises rely on:
  - Pod container `env` cannot be changed in place (0007). On 1.37, resources can only change
    through the resize subresource, so they are not used for that lab.
  - A readiness probe naming a missing port fails with `port "web" not found` (0010).
  - nginx exits on an unknown directive (0008).
  - A missing ConfigMap in `configMapKeyRef` gives `CreateContainerConfigError` (0009).
  - Rollouts with `maxUnavailable` rounded to 0 stall while new Pods are unready.
- **CNCF curriculum.** Domain names and weights above are from CKA v1.37. Update the domain
  column when CNCF publishes a new version.
