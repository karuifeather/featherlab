/**
 * Executable learner behaviour for Level 3 Circuit C (Native Sidecars) and Circuit D
 * (Jobs/Batch). Shared by the real-kind circuit test.
 *
 * Pattern mirrors level2-scenarios.mjs:
 *   solve(k)   the reference solution; all checks must then pass
 *   variants[] plausible mistakes; each starts from a fresh baseline and must leave
 *              exactly the listed checks failing (and the rest passing)
 *   initial[]  objects setup must have created (verified before the baseline check)
 *
 * k.run(...args)  — kubectl, synchronous (execFileSync under the hood)
 * k.apply(yaml)   — kubectl apply -f - with YAML on stdin
 * k.rollout(n,ns) — rollout status deployment/<n> -n <ns>, blocks until complete or timeout
 * k.replace(yaml) — kubectl replace -f - with YAML on stdin
 */

// ── Circuit C: Native Sidecars ─────────────────────────────────────────────────────────────────

export const LEVEL3_CD_SCENARIOS = {
  // 061 — A Supporting Container
  "k8s-0061": {
    initial: [],
    async solve(k) {
      k.apply(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: fl-k8s-0061
spec:
  replicas: 1
  selector:
    matchLabels:
      app: app
  template:
    metadata:
      labels:
        app: app
    spec:
      terminationGracePeriodSeconds: 5
      initContainers:
        - name: logger
          image: busybox:1.36
          restartPolicy: Always
          command: ["sh", "-c", "while true; do echo logging; sleep 5; done"]
      containers:
        - name: app
          image: nginx:1.27
`);
      k.rollout("app", "fl-k8s-0061");
    },
    variants: [
      {
        name: "logger in containers[] instead of initContainers[]",
        async run(k) {
          k.apply(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: fl-k8s-0061
spec:
  replicas: 1
  selector:
    matchLabels:
      app: app
  template:
    metadata:
      labels:
        app: app
    spec:
      terminationGracePeriodSeconds: 5
      containers:
        - name: app
          image: nginx:1.27
        - name: logger
          image: busybox:1.36
          command: ["sh", "-c", "while true; do echo logging; sleep 5; done"]
`);
          k.rollout("app", "fl-k8s-0061");
        },
        failing: ["sidecar"],
      },
      {
        name: "logger missing restartPolicy: Always",
        async run(k) {
          k.apply(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: fl-k8s-0061
spec:
  replicas: 1
  selector:
    matchLabels:
      app: app
  template:
    metadata:
      labels:
        app: app
    spec:
      terminationGracePeriodSeconds: 5
      initContainers:
        - name: logger
          image: busybox:1.36
          command: ["sh", "-c", "echo done"]
      containers:
        - name: app
          image: nginx:1.27
`);
          k.rollout("app", "fl-k8s-0061");
        },
        failing: ["sidecar"],
      },
      {
        name: "wrong image for logger",
        async run(k) {
          k.apply(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: fl-k8s-0061
spec:
  replicas: 1
  selector:
    matchLabels:
      app: app
  template:
    metadata:
      labels:
        app: app
    spec:
      terminationGracePeriodSeconds: 5
      initContainers:
        - name: logger
          image: nginx:1.27
          restartPolicy: Always
          command: ["sh", "-c", "while true; do echo logging; sleep 5; done"]
      containers:
        - name: app
          image: nginx:1.27
`);
          k.rollout("app", "fl-k8s-0061");
        },
        failing: ["sidecar"],
      },
    ],
  },

  // 062 — Sidecar and Shared Files
  "k8s-0062": {
    initial: [],
    async solve(k) {
      k.apply(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: fl-k8s-0062
spec:
  replicas: 1
  selector:
    matchLabels:
      app: app
  template:
    metadata:
      labels:
        app: app
    spec:
      terminationGracePeriodSeconds: 5
      volumes:
        - name: logs
          emptyDir: {}
      initContainers:
        - name: log-collector
          image: busybox:1.36
          restartPolicy: Always
          command: ["sh", "-c", "while true; do echo collecting; sleep 5; done"]
          volumeMounts:
            - name: logs
              mountPath: /collected-logs
      containers:
        - name: app
          image: nginx:1.27
          volumeMounts:
            - name: logs
              mountPath: /var/log/app
`);
      k.rollout("app", "fl-k8s-0062");
    },
    variants: [
      {
        name: "log-collector not a native sidecar (no restartPolicy: Always)",
        async run(k) {
          k.apply(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: fl-k8s-0062
spec:
  replicas: 1
  selector:
    matchLabels:
      app: app
  template:
    metadata:
      labels:
        app: app
    spec:
      terminationGracePeriodSeconds: 5
      volumes:
        - name: logs
          emptyDir: {}
      initContainers:
        - name: log-collector
          image: busybox:1.36
          command: ["sh", "-c", "echo done"]
          volumeMounts:
            - name: logs
              mountPath: /collected-logs
      containers:
        - name: app
          image: nginx:1.27
          volumeMounts:
            - name: logs
              mountPath: /var/log/app
`);
          k.rollout("app", "fl-k8s-0062");
        },
        failing: ["sidecar"],
      },
      {
        name: "no shared volume (missing volumeMounts in app)",
        async run(k) {
          k.apply(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: fl-k8s-0062
spec:
  replicas: 1
  selector:
    matchLabels:
      app: app
  template:
    metadata:
      labels:
        app: app
    spec:
      terminationGracePeriodSeconds: 5
      volumes:
        - name: logs
          emptyDir: {}
      initContainers:
        - name: log-collector
          image: busybox:1.36
          restartPolicy: Always
          command: ["sh", "-c", "while true; do echo collecting; sleep 5; done"]
          volumeMounts:
            - name: logs
              mountPath: /collected-logs
      containers:
        - name: app
          image: nginx:1.27
`);
          k.rollout("app", "fl-k8s-0062");
        },
        failing: ["shared-vol"],
      },
    ],
  },

  // 063 — Startup Ordering with Native Sidecar
  "k8s-0063": {
    initial: [["Deployment", "web-app", "fl-k8s-0063"]],
    async solve(k) {
      // Setup creates this Deployment with kubectl create (no last-applied annotation), so
      // kubectl apply cannot remove "helper" from containers[]. Use replace --force instead.
      k.replace(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app
  namespace: fl-k8s-0063
spec:
  replicas: 1
  selector:
    matchLabels:
      app: web-app
  template:
    metadata:
      labels:
        app: web-app
    spec:
      terminationGracePeriodSeconds: 5
      initContainers:
        - name: helper
          image: busybox:1.36
          restartPolicy: Always
          command: ["sh", "-c", "while true; do echo helper; sleep 10; done"]
      containers:
        - name: app
          image: nginx:1.27
`);
      k.rollout("web-app", "fl-k8s-0063");
    },
    variants: [
      {
        name: "helper still in containers[] (not moved to initContainers)",
        async run(k) {
          // setup already has helper in containers[]; just wait for rollout
          k.run("rollout", "status", "deployment/web-app", "-n", "fl-k8s-0063", "--timeout=60s");
        },
        failing: ["sidecar"],
      },
    ],
  },

  // 064 — Repair the Native Sidecar
  "k8s-0064": {
    initial: [["Deployment", "backend", "fl-k8s-0064"]],
    async solve(k) {
      k.run(
        "patch",
        "deployment",
        "backend",
        "-n",
        "fl-k8s-0064",
        "--type=json",
        "-p",
        '[{"op":"replace","path":"/spec/template/spec/initContainers/0/command","value":["sh","-c","while true; do sleep 30; done"]}]',
      );
      k.rollout("backend", "fl-k8s-0064");
    },
    variants: [
      {
        name: "command still broken (exit 1) — rollout never completes",
        async run() {
          // setup already has the broken command; do nothing (just verify initial state fails)
        },
        failing: ["rollout"],
      },
      {
        name: "monitor removed from initContainers",
        async run(k) {
          // Use replace (not apply) — strategic merge patch preserves initContainers when omitted,
          // so kubectl apply would NOT remove the monitor sidecar.
          k.replace(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: fl-k8s-0064
spec:
  replicas: 1
  selector:
    matchLabels:
      app: backend
  template:
    metadata:
      labels:
        app: backend
    spec:
      terminationGracePeriodSeconds: 5
      containers:
        - name: app
          image: nginx:1.27
`);
          k.rollout("backend", "fl-k8s-0064");
        },
        failing: ["sidecar"],
      },
    ],
  },

  // ── Circuit D: Jobs ────────────────────────────────────────────────────────────────────────────

  // 065 — Your First Job
  "k8s-0065": {
    initial: [],
    async solve(k) {
      k.apply(`
apiVersion: batch/v1
kind: Job
metadata:
  name: hello-job
  namespace: fl-k8s-0065
spec:
  template:
    spec:
      restartPolicy: Never
      terminationGracePeriodSeconds: 5
      containers:
        - name: hello
          image: busybox:1.36
          command: ["sh", "-c", "echo hello from job"]
`);
      k.run(
        "wait",
        "--for=condition=complete",
        "job/hello-job",
        "-n",
        "fl-k8s-0065",
        "--timeout=120s",
      );
    },
    variants: [
      {
        name: "wrong image (nginx:1.27 instead of busybox:1.36)",
        async run(k) {
          k.apply(`
apiVersion: batch/v1
kind: Job
metadata:
  name: hello-job
  namespace: fl-k8s-0065
spec:
  template:
    spec:
      restartPolicy: Never
      terminationGracePeriodSeconds: 5
      containers:
        - name: hello
          image: nginx:1.27
          command: ["sh", "-c", "echo hello from job"]
`);
          k.run(
            "wait",
            "--for=condition=complete",
            "job/hello-job",
            "-n",
            "fl-k8s-0065",
            "--timeout=120s",
          );
        },
        failing: ["image"],
      },
    ],
  },

  // 066 — Job Status and Logs
  "k8s-0066": {
    initial: [["Job", "data-processor", "fl-k8s-0066"]],
    async solve(k) {
      k.apply(`
apiVersion: batch/v1
kind: Job
metadata:
  name: summary-job
  namespace: fl-k8s-0066
spec:
  template:
    spec:
      restartPolicy: Never
      terminationGracePeriodSeconds: 5
      containers:
        - name: summary
          image: busybox:1.36
          command: ["sh", "-c", "echo summary-done"]
`);
      k.run(
        "wait",
        "--for=condition=complete",
        "job/summary-job",
        "-n",
        "fl-k8s-0066",
        "--timeout=120s",
      );
    },
    variants: [
      {
        name: "wrong image for summary-job",
        async run(k) {
          k.apply(`
apiVersion: batch/v1
kind: Job
metadata:
  name: summary-job
  namespace: fl-k8s-0066
spec:
  template:
    spec:
      restartPolicy: Never
      terminationGracePeriodSeconds: 5
      containers:
        - name: summary
          image: nginx:1.27
          command: ["sh", "-c", "echo summary-done"]
`);
          k.run(
            "wait",
            "--for=condition=complete",
            "job/summary-job",
            "-n",
            "fl-k8s-0066",
            "--timeout=120s",
          );
        },
        failing: ["image"],
      },
    ],
  },

  // 067 — Recover a Failed Job
  "k8s-0067": {
    initial: [["Job", "batch", "fl-k8s-0067"]],
    async solve(k) {
      k.run("delete", "job", "batch", "-n", "fl-k8s-0067", "--ignore-not-found");
      k.apply(`
apiVersion: batch/v1
kind: Job
metadata:
  name: batch
  namespace: fl-k8s-0067
spec:
  backoffLimit: 2
  template:
    spec:
      restartPolicy: Never
      terminationGracePeriodSeconds: 5
      containers:
        - name: worker
          image: busybox:1.36
          command: ["sh", "-c", "echo batch-done"]
`);
      k.run("wait", "--for=condition=complete", "job/batch", "-n", "fl-k8s-0067", "--timeout=120s");
    },
    variants: [
      {
        name: "recreated with wrong backoffLimit (0 instead of 2)",
        async run(k) {
          k.run("delete", "job", "batch", "-n", "fl-k8s-0067", "--ignore-not-found");
          k.apply(`
apiVersion: batch/v1
kind: Job
metadata:
  name: batch
  namespace: fl-k8s-0067
spec:
  backoffLimit: 0
  template:
    spec:
      restartPolicy: Never
      terminationGracePeriodSeconds: 5
      containers:
        - name: worker
          image: busybox:1.36
          command: ["sh", "-c", "echo batch-done"]
`);
          k.run(
            "wait",
            "--for=condition=complete",
            "job/batch",
            "-n",
            "fl-k8s-0067",
            "--timeout=120s",
          );
        },
        failing: ["config"],
      },
    ],
  },

  // 068 — Multiple Completions and Parallelism
  "k8s-0068": {
    initial: [],
    async solve(k) {
      k.apply(`
apiVersion: batch/v1
kind: Job
metadata:
  name: worker
  namespace: fl-k8s-0068
spec:
  completions: 4
  parallelism: 2
  template:
    spec:
      restartPolicy: Never
      terminationGracePeriodSeconds: 5
      containers:
        - name: worker
          image: busybox:1.36
          command: ["sh", "-c", "echo worker-done"]
`);
      k.run(
        "wait",
        "--for=condition=complete",
        "job/worker",
        "-n",
        "fl-k8s-0068",
        "--timeout=180s",
      );
    },
    variants: [
      {
        name: "wrong completions (2 instead of 4)",
        async run(k) {
          k.apply(`
apiVersion: batch/v1
kind: Job
metadata:
  name: worker
  namespace: fl-k8s-0068
spec:
  completions: 2
  parallelism: 2
  template:
    spec:
      restartPolicy: Never
      terminationGracePeriodSeconds: 5
      containers:
        - name: worker
          image: busybox:1.36
          command: ["sh", "-c", "echo worker-done"]
`);
          k.run(
            "wait",
            "--for=condition=complete",
            "job/worker",
            "-n",
            "fl-k8s-0068",
            "--timeout=120s",
          );
        },
        failing: ["config"],
      },
      {
        name: "wrong parallelism (1 instead of 2)",
        async run(k) {
          k.apply(`
apiVersion: batch/v1
kind: Job
metadata:
  name: worker
  namespace: fl-k8s-0068
spec:
  completions: 4
  parallelism: 1
  template:
    spec:
      restartPolicy: Never
      terminationGracePeriodSeconds: 5
      containers:
        - name: worker
          image: busybox:1.36
          command: ["sh", "-c", "echo worker-done"]
`);
          k.run(
            "wait",
            "--for=condition=complete",
            "job/worker",
            "-n",
            "fl-k8s-0068",
            "--timeout=180s",
          );
        },
        failing: ["config"],
      },
    ],
  },

  // 069 — Retry and Deadline Controls
  "k8s-0069": {
    initial: [],
    async solve(k) {
      k.apply(`
apiVersion: batch/v1
kind: Job
metadata:
  name: safe-task
  namespace: fl-k8s-0069
spec:
  backoffLimit: 3
  activeDeadlineSeconds: 60
  template:
    spec:
      restartPolicy: Never
      terminationGracePeriodSeconds: 5
      containers:
        - name: task
          image: busybox:1.36
          command: ["sh", "-c", "echo safe-done"]
`);
      k.run(
        "wait",
        "--for=condition=complete",
        "job/safe-task",
        "-n",
        "fl-k8s-0069",
        "--timeout=120s",
      );
    },
    variants: [
      {
        name: "wrong backoffLimit (1 instead of 3)",
        async run(k) {
          k.apply(`
apiVersion: batch/v1
kind: Job
metadata:
  name: safe-task
  namespace: fl-k8s-0069
spec:
  backoffLimit: 1
  activeDeadlineSeconds: 60
  template:
    spec:
      restartPolicy: Never
      terminationGracePeriodSeconds: 5
      containers:
        - name: task
          image: busybox:1.36
          command: ["sh", "-c", "echo safe-done"]
`);
          k.run(
            "wait",
            "--for=condition=complete",
            "job/safe-task",
            "-n",
            "fl-k8s-0069",
            "--timeout=120s",
          );
        },
        failing: ["config"],
      },
      {
        name: "missing activeDeadlineSeconds",
        async run(k) {
          k.apply(`
apiVersion: batch/v1
kind: Job
metadata:
  name: safe-task
  namespace: fl-k8s-0069
spec:
  backoffLimit: 3
  template:
    spec:
      restartPolicy: Never
      terminationGracePeriodSeconds: 5
      containers:
        - name: task
          image: busybox:1.36
          command: ["sh", "-c", "echo safe-done"]
`);
          k.run(
            "wait",
            "--for=condition=complete",
            "job/safe-task",
            "-n",
            "fl-k8s-0069",
            "--timeout=120s",
          );
        },
        failing: ["config"],
      },
    ],
  },
};
