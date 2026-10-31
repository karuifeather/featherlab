/**
 * Executable learner behaviour for Level 3 Circuit E (CronJobs), Circuit F (DaemonSets),
 * and the Final Challenge (Application Patterns Mastery). Shared by the real-kind circuit test.
 *
 * Pattern mirrors level3-a-b-scenarios.mjs:
 *   solve(k)   the reference solution; all checks must then pass
 *   variants   plausible mistakes; each starts from a fresh baseline and must leave
 *              exactly the listed checks failing (and the rest passing)
 *   initial    objects setup must have created (verified before the baseline check)
 *
 * k.run(...args)       — kubectl, synchronous (execFileSync under the hood)
 * k.apply(yaml)        — kubectl apply -f - with YAML on stdin
 * k.rollout(name, ns)  — rollout status deployment/<name> -n <ns> (Deployments only)
 *
 * NOTE: For DaemonSet rollout status use:
 *   k.run("rollout", "status", "daemonset/<name>", "-n", ns, "--timeout=120s")
 * because k.rollout() is hardcoded to "deployment/".
 */

// ── Circuit E: CronJobs ───────────────────────────────────────────────────────

export const LEVEL3_EF_SCENARIOS = {
  // 070 — Create a Scheduled Job
  "k8s-0070": {
    initial: [],
    async solve(k) {
      k.run(
        "create",
        "cronjob",
        "report",
        "--image=busybox:1.36",
        "--schedule=*/5 * * * *",
        "--restart=Never",
        "-n",
        "fl-k8s-0070",
        "--",
        "sh",
        "-c",
        "echo report-$(date +%s)",
      );
    },
    variants: [
      {
        name: "wrong schedule (every hour instead of every 5 minutes)",
        async run(k) {
          k.run(
            "create",
            "cronjob",
            "report",
            "--image=busybox:1.36",
            "--schedule=0 * * * *",
            "--restart=Never",
            "-n",
            "fl-k8s-0070",
            "--",
            "sh",
            "-c",
            "echo report-$(date +%s)",
          );
        },
        failing: ["schedule"],
      },
      {
        name: "cronjob not created (namespace is empty)",
        async run() {
          // Nothing created — both exists and schedule checks should fail.
        },
        failing: ["exists", "schedule"],
      },
    ],
  },

  // 071 — Run the Template Now
  "k8s-0071": {
    initial: [["cronjob", "reporter", "fl-k8s-0071"]],
    async solve(k) {
      k.run("create", "job", "manual-report", "--from=cronjob/reporter", "-n", "fl-k8s-0071");
      k.run(
        "wait",
        "--for=condition=complete",
        "job/manual-report",
        "-n",
        "fl-k8s-0071",
        "--timeout=120s",
      );
    },
    variants: [
      {
        name: "job created with wrong name (run-now instead of manual-report)",
        async run(k) {
          k.run("create", "job", "run-now", "--from=cronjob/reporter", "-n", "fl-k8s-0071");
          k.run(
            "wait",
            "--for=condition=complete",
            "job/run-now",
            "-n",
            "fl-k8s-0071",
            "--timeout=120s",
          );
        },
        failing: ["manual-job", "complete"],
      },
      {
        name: "job created but not waited for (check run before job completes)",
        async run(k) {
          // Create the job but do not wait — the complete check should fail immediately.
          k.run("create", "job", "manual-report", "--from=cronjob/reporter", "-n", "fl-k8s-0071");
          // Intentionally omit the wait so the job may still be running.
        },
        failing: ["complete"],
      },
    ],
  },

  // 072 — Suspend and Maintain
  "k8s-0072": {
    initial: [["cronjob", "cleanup", "fl-k8s-0072"]],
    async solve(k) {
      k.run(
        "patch",
        "cronjob",
        "cleanup",
        "-n",
        "fl-k8s-0072",
        "--type=merge",
        "-p",
        JSON.stringify({
          spec: {
            suspend: true,
            successfulJobsHistoryLimit: 3,
            failedJobsHistoryLimit: 1,
          },
        }),
      );
    },
    variants: [
      {
        name: "suspend true but history limits not changed",
        async run(k) {
          k.run(
            "patch",
            "cronjob",
            "cleanup",
            "-n",
            "fl-k8s-0072",
            "--type=merge",
            "-p",
            JSON.stringify({ spec: { suspend: true } }),
          );
        },
        // cronjob-config checks suspend, successfulJobsHistoryLimit, and failedJobsHistoryLimit together
        failing: ["config"],
      },
      {
        name: "history limits correct but not suspended",
        async run(k) {
          k.run(
            "patch",
            "cronjob",
            "cleanup",
            "-n",
            "fl-k8s-0072",
            "--type=merge",
            "-p",
            JSON.stringify({
              spec: {
                successfulJobsHistoryLimit: 3,
                failedJobsHistoryLimit: 1,
              },
            }),
          );
        },
        failing: ["config"],
      },
    ],
  },

  // 073 — Repair a Broken Schedule
  "k8s-0073": {
    initial: [["cronjob", "metrics", "fl-k8s-0073"]],
    async solve(k) {
      k.run(
        "patch",
        "cronjob",
        "metrics",
        "-n",
        "fl-k8s-0073",
        "--type=merge",
        "-p",
        JSON.stringify({
          spec: { schedule: "*/10 * * * *", suspend: false },
        }),
      );
    },
    variants: [
      {
        name: "schedule fixed but still suspended",
        async run(k) {
          k.run(
            "patch",
            "cronjob",
            "metrics",
            "-n",
            "fl-k8s-0073",
            "--type=merge",
            "-p",
            JSON.stringify({ spec: { schedule: "*/10 * * * *" } }),
          );
          // suspend remains true from setup — not unsuspended
        },
        failing: ["config"],
      },
      {
        name: "unsuspended but schedule not fixed (still 0 0 * * *)",
        async run(k) {
          k.run(
            "patch",
            "cronjob",
            "metrics",
            "-n",
            "fl-k8s-0073",
            "--type=merge",
            "-p",
            JSON.stringify({ spec: { suspend: false } }),
          );
        },
        failing: ["config"],
      },
    ],
  },

  // ── Circuit F: DaemonSets ─────────────────────────────────────────────────

  // 074 — Meet the DaemonSet
  "k8s-0074": {
    initial: [],
    async solve(k) {
      k.apply(`
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: node-checker
  namespace: fl-k8s-0074
spec:
  selector:
    matchLabels:
      app: node-checker
  template:
    metadata:
      labels:
        app: node-checker
    spec:
      terminationGracePeriodSeconds: 5
      containers:
        - name: checker
          image: busybox:1.36
          command: ["sh", "-c", "while true; do echo ok; sleep 30; done"]
`);
      k.run("rollout", "status", "daemonset/node-checker", "-n", "fl-k8s-0074", "--timeout=120s");
    },
    variants: [
      {
        name: "wrong image (nginx:1.27 instead of busybox:1.36)",
        async run(k) {
          k.apply(`
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: node-checker
  namespace: fl-k8s-0074
spec:
  selector:
    matchLabels:
      app: node-checker
  template:
    metadata:
      labels:
        app: node-checker
    spec:
      terminationGracePeriodSeconds: 5
      containers:
        - name: checker
          image: nginx:1.27
`);
          k.run(
            "rollout",
            "status",
            "daemonset/node-checker",
            "-n",
            "fl-k8s-0074",
            "--timeout=120s",
          );
        },
        failing: ["image"],
      },
      {
        name: "daemonset not created (namespace empty)",
        async run() {
          // Nothing created — all checks should fail.
        },
        failing: ["exists", "image", "ready"],
      },
    ],
  },

  // 075 — Maintain a Node-Local Helper
  "k8s-0075": {
    initial: [["daemonset", "log-forwarder", "fl-k8s-0075"]],
    async solve(k) {
      // Adding a metadata label to a DaemonSet does not trigger a Pod rollout.
      k.run("label", "daemonset", "log-forwarder", "tier=monitoring", "-n", "fl-k8s-0075");
    },
    variants: [
      {
        name: "wrong label key (type=monitoring instead of tier=monitoring)",
        async run(k) {
          k.run("label", "daemonset", "log-forwarder", "type=monitoring", "-n", "fl-k8s-0075");
        },
        failing: ["label"],
      },
      {
        name: "wrong label value (tier=observability instead of tier=monitoring)",
        async run(k) {
          k.run("label", "daemonset", "log-forwarder", "tier=observability", "-n", "fl-k8s-0075");
        },
        failing: ["label"],
      },
    ],
  },

  // 076 — Observe DaemonSet Scheduling
  "k8s-0076": {
    initial: [["daemonset", "cluster-agent", "fl-k8s-0076"]],
    async solve(k) {
      // Adding a metadata label — no Pod rollout triggered.
      k.run("label", "daemonset", "cluster-agent", "observed=yes", "-n", "fl-k8s-0076");
    },
    variants: [
      {
        name: "label value is 'true' instead of 'yes'",
        async run(k) {
          k.run("label", "daemonset", "cluster-agent", "observed=true", "-n", "fl-k8s-0076");
        },
        failing: ["label"],
      },
      {
        name: "label not applied at all",
        async run() {
          // No label applied — label check fails, but daemonset is still ready from setup.
        },
        failing: ["label"],
      },
    ],
  },

  // 077 — Choose the Correct Controller
  "k8s-0077": {
    initial: [
      ["job", "web-server", "fl-k8s-0077"],
      ["deployment", "batch-task", "fl-k8s-0077"],
      ["deployment", "node-monitor", "fl-k8s-0077"],
      ["pod", "report-runner", "fl-k8s-0077"],
    ],
    async solve(k) {
      // Delete all wrong-controller resources
      k.run("delete", "job", "web-server", "-n", "fl-k8s-0077");
      k.run("delete", "deployment", "batch-task", "node-monitor", "-n", "fl-k8s-0077");
      k.run("delete", "pod", "report-runner", "-n", "fl-k8s-0077");

      // Create the correct resources
      k.run(
        "create",
        "deployment",
        "web-server",
        "--image=nginx:1.27",
        "--replicas=2",
        "-n",
        "fl-k8s-0077",
      );

      k.run(
        "create",
        "job",
        "batch-task",
        "--image=busybox:1.36",
        "-n",
        "fl-k8s-0077",
        "--",
        "sh",
        "-c",
        "echo batch done",
      );

      k.apply(`
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: node-monitor
  namespace: fl-k8s-0077
spec:
  selector:
    matchLabels:
      app: node-monitor
  template:
    metadata:
      labels:
        app: node-monitor
    spec:
      terminationGracePeriodSeconds: 5
      containers:
        - name: monitor
          image: busybox:1.36
          command: ["sh", "-c", "while true; do echo monitoring; sleep 30; done"]
`);

      k.run(
        "create",
        "cronjob",
        "report-runner",
        "--image=busybox:1.36",
        "--schedule=0 6 * * *",
        "--restart=Never",
        "-n",
        "fl-k8s-0077",
        "--",
        "sh",
        "-c",
        "echo report",
      );

      // Wait for Deployment and Job to complete
      await k.rollout("web-server", "fl-k8s-0077");
      k.run(
        "wait",
        "--for=condition=complete",
        "job/batch-task",
        "-n",
        "fl-k8s-0077",
        "--timeout=120s",
      );
      k.run("rollout", "status", "daemonset/node-monitor", "-n", "fl-k8s-0077", "--timeout=120s");
    },
    variants: [
      {
        name: "web-server created as Deployment with 1 replica instead of 2",
        async run(k) {
          k.run("delete", "job", "web-server", "-n", "fl-k8s-0077");
          k.run("delete", "deployment", "batch-task", "node-monitor", "-n", "fl-k8s-0077");
          k.run("delete", "pod", "report-runner", "-n", "fl-k8s-0077");

          k.run(
            "create",
            "deployment",
            "web-server",
            "--image=nginx:1.27",
            "--replicas=1",
            "-n",
            "fl-k8s-0077",
          );
          k.run(
            "create",
            "job",
            "batch-task",
            "--image=busybox:1.36",
            "-n",
            "fl-k8s-0077",
            "--",
            "sh",
            "-c",
            "echo batch done",
          );
          k.apply(`
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: node-monitor
  namespace: fl-k8s-0077
spec:
  selector:
    matchLabels:
      app: node-monitor
  template:
    metadata:
      labels:
        app: node-monitor
    spec:
      terminationGracePeriodSeconds: 5
      containers:
        - name: monitor
          image: busybox:1.36
          command: ["sh", "-c", "while true; do echo monitoring; sleep 30; done"]
`);
          k.run(
            "create",
            "cronjob",
            "report-runner",
            "--image=busybox:1.36",
            "--schedule=0 6 * * *",
            "--restart=Never",
            "-n",
            "fl-k8s-0077",
            "--",
            "sh",
            "-c",
            "echo report",
          );
          await k.rollout("web-server", "fl-k8s-0077");
          k.run(
            "wait",
            "--for=condition=complete",
            "job/batch-task",
            "-n",
            "fl-k8s-0077",
            "--timeout=120s",
          );
          k.run(
            "rollout",
            "status",
            "daemonset/node-monitor",
            "-n",
            "fl-k8s-0077",
            "--timeout=120s",
          );
        },
        failing: ["web-rollout"],
      },
    ],
  },

  // ── Final Challenge ───────────────────────────────────────────────────────

  // 078 — Application Patterns Mastery
  "k8s-0078": {
    initial: [
      ["deployment", "api", "fl-k8s-0078"],
      ["cronjob", "archiver", "fl-k8s-0078"],
      ["daemonset", "metrics", "fl-k8s-0078"],
    ],
    async solve(k) {
      // Fix Deployment init container image
      k.run(
        "patch",
        "deployment",
        "api",
        "-n",
        "fl-k8s-0078",
        "--type=json",
        "-p",
        JSON.stringify([
          {
            op: "replace",
            path: "/spec/template/spec/initContainers/0/image",
            value: "busybox:1.36",
          },
        ]),
      );
      await k.rollout("api", "fl-k8s-0078");

      // Create the data-fix Job
      k.run(
        "create",
        "job",
        "data-fix",
        "--image=busybox:1.36",
        "-n",
        "fl-k8s-0078",
        "--",
        "sh",
        "-c",
        "echo data fixed",
      );
      k.run(
        "wait",
        "--for=condition=complete",
        "job/data-fix",
        "-n",
        "fl-k8s-0078",
        "--timeout=120s",
      );

      // Fix CronJob schedule
      k.run(
        "patch",
        "cronjob",
        "archiver",
        "-n",
        "fl-k8s-0078",
        "--type=merge",
        "-p",
        JSON.stringify({ spec: { schedule: "0 0 * * 0" } }),
      );

      // Fix DaemonSet image
      k.run("set", "image", "daemonset/metrics", "collector=busybox:1.36", "-n", "fl-k8s-0078");
      k.run("rollout", "status", "daemonset/metrics", "-n", "fl-k8s-0078", "--timeout=120s");
    },
    variants: [
      {
        name: "api init container fixed and rolled out but data-fix job not created",
        async run(k) {
          k.run(
            "patch",
            "deployment",
            "api",
            "-n",
            "fl-k8s-0078",
            "--type=json",
            "-p",
            JSON.stringify([
              {
                op: "replace",
                path: "/spec/template/spec/initContainers/0/image",
                value: "busybox:1.36",
              },
            ]),
          );
          await k.rollout("api", "fl-k8s-0078");

          k.run(
            "patch",
            "cronjob",
            "archiver",
            "-n",
            "fl-k8s-0078",
            "--type=merge",
            "-p",
            JSON.stringify({ spec: { schedule: "0 0 * * 0" } }),
          );

          k.run("set", "image", "daemonset/metrics", "collector=busybox:1.36", "-n", "fl-k8s-0078");
          k.run("rollout", "status", "daemonset/metrics", "-n", "fl-k8s-0078", "--timeout=120s");
          // data-fix job intentionally omitted
        },
        failing: ["data-fix-complete"],
      },
      {
        name: "archiver schedule not fixed (still Feb 31)",
        async run(k) {
          k.run(
            "patch",
            "deployment",
            "api",
            "-n",
            "fl-k8s-0078",
            "--type=json",
            "-p",
            JSON.stringify([
              {
                op: "replace",
                path: "/spec/template/spec/initContainers/0/image",
                value: "busybox:1.36",
              },
            ]),
          );
          await k.rollout("api", "fl-k8s-0078");

          k.run(
            "create",
            "job",
            "data-fix",
            "--image=busybox:1.36",
            "-n",
            "fl-k8s-0078",
            "--",
            "sh",
            "-c",
            "echo data fixed",
          );
          k.run(
            "wait",
            "--for=condition=complete",
            "job/data-fix",
            "-n",
            "fl-k8s-0078",
            "--timeout=120s",
          );

          // archiver schedule left as-is (broken)

          k.run("set", "image", "daemonset/metrics", "collector=busybox:1.36", "-n", "fl-k8s-0078");
          k.run("rollout", "status", "daemonset/metrics", "-n", "fl-k8s-0078", "--timeout=120s");
        },
        failing: ["archiver-schedule"],
      },
      {
        name: "daemonset fixed to wrong image (nginx:1.27 instead of busybox:1.36)",
        async run(k) {
          k.run(
            "patch",
            "deployment",
            "api",
            "-n",
            "fl-k8s-0078",
            "--type=json",
            "-p",
            JSON.stringify([
              {
                op: "replace",
                path: "/spec/template/spec/initContainers/0/image",
                value: "busybox:1.36",
              },
            ]),
          );
          await k.rollout("api", "fl-k8s-0078");

          k.run(
            "create",
            "job",
            "data-fix",
            "--image=busybox:1.36",
            "-n",
            "fl-k8s-0078",
            "--",
            "sh",
            "-c",
            "echo data fixed",
          );
          k.run(
            "wait",
            "--for=condition=complete",
            "job/data-fix",
            "-n",
            "fl-k8s-0078",
            "--timeout=120s",
          );

          k.run(
            "patch",
            "cronjob",
            "archiver",
            "-n",
            "fl-k8s-0078",
            "--type=merge",
            "-p",
            JSON.stringify({ spec: { schedule: "0 0 * * 0" } }),
          );

          // DaemonSet image fixed to nginx:1.27 — works but wrong image
          k.run("set", "image", "daemonset/metrics", "collector=nginx:1.27", "-n", "fl-k8s-0078");
          k.run("rollout", "status", "daemonset/metrics", "-n", "fl-k8s-0078", "--timeout=120s");
        },
        failing: ["metrics-image"],
      },
    ],
  },
};
