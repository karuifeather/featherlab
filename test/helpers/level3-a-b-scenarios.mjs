/**
 * Executable learner behaviour for Level 3 Circuit A (Temporary Pods) and Circuit B
 * (Init Containers and Shared Data). Shared by the real-kind circuit test.
 *
 * Pattern mirrors level2-scenarios.mjs:
 *   solve(k)   the reference solution; all checks must then pass
 *   variants   plausible mistakes; each starts from a fresh baseline and must leave
 *              exactly the listed checks failing (and the rest passing)
 *   initial    objects setup must have created (verified before the baseline check)
 *
 * k.run(...args)  — kubectl, synchronous (execFileSync under the hood)
 * k.apply(yaml)   — kubectl apply -f - with YAML on stdin
 * k.rollout(n,ns) — rollout status deployment/<n> -n <ns>, blocks until complete or timeout
 */

// ── Circuit A: Temporary Pods ──────────────────────────────────────────────────────────────────

export const LEVEL3_AB_SCENARIOS = {
  // 054 — Run a One-Time Pod
  "k8s-0054": {
    initial: [],
    async solve(k) {
      k.apply(`
apiVersion: v1
kind: Pod
metadata:
  name: task-runner
  namespace: fl-k8s-0054
spec:
  restartPolicy: Never
  terminationGracePeriodSeconds: 5
  containers:
    - name: task-runner
      image: busybox:1.36
      command: ["sh", "-c", "echo task complete"]
`);
      k.run(
        "wait",
        "pod/task-runner",
        "-n",
        "fl-k8s-0054",
        "--for=jsonpath={.status.phase}=Succeeded",
        "--timeout=120s",
      );
    },
    variants: [
      {
        name: "wrong image (nginx:1.27 instead of busybox:1.36)",
        async run(k) {
          k.apply(`
apiVersion: v1
kind: Pod
metadata:
  name: task-runner
  namespace: fl-k8s-0054
spec:
  restartPolicy: Never
  terminationGracePeriodSeconds: 5
  containers:
    - name: task-runner
      image: nginx:1.27
      command: ["sh", "-c", "echo task complete"]
`);
          k.run(
            "wait",
            "pod/task-runner",
            "-n",
            "fl-k8s-0054",
            "--for=jsonpath={.status.phase}=Succeeded",
            "--timeout=120s",
          );
        },
        failing: ["image"],
      },
      {
        name: "restartPolicy: Always instead of Never (pod never reaches Succeeded)",
        async run(k) {
          k.apply(`
apiVersion: v1
kind: Pod
metadata:
  name: task-runner
  namespace: fl-k8s-0054
spec:
  restartPolicy: Always
  terminationGracePeriodSeconds: 5
  containers:
    - name: task-runner
      image: busybox:1.36
      command: ["sh", "-c", "echo task complete"]
`);
          // With restartPolicy: Always, the pod keeps restarting and never reaches Succeeded.
          // Do not wait for Succeeded — it won't happen.
        },
        failing: ["phase"],
      },
    ],
  },

  // 055 — Inspect a Completed Task
  "k8s-0055": {
    initial: [["pod", "data-probe", "fl-k8s-0055"]],
    async solve(k) {
      // Wait for setup pod to reach Succeeded (it completes almost immediately).
      k.run(
        "wait",
        "pod/data-probe",
        "-n",
        "fl-k8s-0055",
        "--for=jsonpath={.status.phase}=Succeeded",
        "--timeout=120s",
      );
      k.apply(`
apiVersion: v1
kind: Pod
metadata:
  name: inspector
  namespace: fl-k8s-0055
spec:
  restartPolicy: Never
  terminationGracePeriodSeconds: 5
  containers:
    - name: inspector
      image: busybox:1.36
      command: ["sh", "-c", "echo found it"]
`);
      k.run(
        "wait",
        "pod/inspector",
        "-n",
        "fl-k8s-0055",
        "--for=jsonpath={.status.phase}=Succeeded",
        "--timeout=120s",
      );
    },
    variants: [
      {
        name: "inspector created with restartPolicy: Always (never reaches Succeeded)",
        async run(k) {
          k.run(
            "wait",
            "pod/data-probe",
            "-n",
            "fl-k8s-0055",
            "--for=jsonpath={.status.phase}=Succeeded",
            "--timeout=120s",
          );
          k.apply(`
apiVersion: v1
kind: Pod
metadata:
  name: inspector
  namespace: fl-k8s-0055
spec:
  restartPolicy: Always
  terminationGracePeriodSeconds: 5
  containers:
    - name: inspector
      image: busybox:1.36
      command: ["sh", "-c", "echo found it"]
`);
          // With restartPolicy: Always the pod restarts and never reaches Succeeded.
        },
        failing: ["inspector-phase"],
      },
      {
        name: "inspector not created (only data-probe exists)",
        async run(k) {
          // Wait for data-probe but do not create inspector.
          k.run(
            "wait",
            "pod/data-probe",
            "-n",
            "fl-k8s-0055",
            "--for=jsonpath={.status.phase}=Succeeded",
            "--timeout=120s",
          );
        },
        failing: ["inspector-exists", "inspector-phase"],
      },
    ],
  },

  // 056 — Fix a Startup Command
  "k8s-0056": {
    initial: [["pod", "worker", "fl-k8s-0056"]],
    async solve(k) {
      // Delete the broken pod (it's in Failed state after setup).
      k.run("delete", "pod", "worker", "-n", "fl-k8s-0056");
      k.apply(`
apiVersion: v1
kind: Pod
metadata:
  name: worker
  namespace: fl-k8s-0056
spec:
  restartPolicy: Never
  terminationGracePeriodSeconds: 5
  containers:
    - name: worker
      image: busybox:1.36
      command: ["sh", "-c", "echo hello"]
`);
      k.run(
        "wait",
        "pod/worker",
        "-n",
        "fl-k8s-0056",
        "--for=jsonpath={.status.phase}=Succeeded",
        "--timeout=120s",
      );
    },
    variants: [
      {
        name: "delete worker but create with wrong pod name (task-runner instead of worker)",
        async run(k) {
          k.run("delete", "pod", "worker", "-n", "fl-k8s-0056");
          k.apply(`
apiVersion: v1
kind: Pod
metadata:
  name: task-runner
  namespace: fl-k8s-0056
spec:
  restartPolicy: Never
  terminationGracePeriodSeconds: 5
  containers:
    - name: task-runner
      image: busybox:1.36
      command: ["sh", "-c", "echo hello"]
`);
          k.run(
            "wait",
            "pod/task-runner",
            "-n",
            "fl-k8s-0056",
            "--for=jsonpath={.status.phase}=Succeeded",
            "--timeout=120s",
          );
        },
        failing: ["exists", "phase"],
      },
      {
        name: "delete and recreate worker but typo still present (echoo instead of echo)",
        async run(k) {
          k.run("delete", "pod", "worker", "-n", "fl-k8s-0056");
          k.apply(`
apiVersion: v1
kind: Pod
metadata:
  name: worker
  namespace: fl-k8s-0056
spec:
  restartPolicy: Never
  terminationGracePeriodSeconds: 5
  containers:
    - name: worker
      image: busybox:1.36
      command: ["sh", "-c", "echoo hello"]
`);
          // echoo is still a typo; pod will fail with non-zero exit code
          k.run(
            "wait",
            "pod/worker",
            "-n",
            "fl-k8s-0056",
            "--for=jsonpath={.status.phase}=Failed",
            "--timeout=60s",
          );
        },
        failing: ["phase"],
      },
    ],
  },

  // ── Circuit B: Init Containers ────────────────────────────────────────────────────────────────

  // 057 — Initialize Before Starting
  "k8s-0057": {
    initial: [],
    async solve(k) {
      k.apply(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: fl-k8s-0057
  labels: { app: app }
spec:
  replicas: 1
  selector:
    matchLabels: { app: app }
  template:
    metadata:
      labels: { app: app }
    spec:
      terminationGracePeriodSeconds: 5
      initContainers:
        - name: setup
          image: busybox:1.36
          command: ["sh", "-c", "echo init done && sleep 1"]
      containers:
        - name: app
          image: nginx:1.27
`);
      await k.rollout("app", "fl-k8s-0057");
    },
    variants: [
      {
        name: "no init container (deployment has only main container app)",
        async run(k) {
          k.apply(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: fl-k8s-0057
  labels: { app: app }
spec:
  replicas: 1
  selector:
    matchLabels: { app: app }
  template:
    metadata:
      labels: { app: app }
    spec:
      terminationGracePeriodSeconds: 5
      containers:
        - name: app
          image: nginx:1.27
`);
          await k.rollout("app", "fl-k8s-0057");
        },
        failing: ["init"],
      },
      {
        name: "init container named 'initializer' instead of 'setup'",
        async run(k) {
          k.apply(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: fl-k8s-0057
  labels: { app: app }
spec:
  replicas: 1
  selector:
    matchLabels: { app: app }
  template:
    metadata:
      labels: { app: app }
    spec:
      terminationGracePeriodSeconds: 5
      initContainers:
        - name: initializer
          image: busybox:1.36
          command: ["sh", "-c", "echo init done && sleep 1"]
      containers:
        - name: app
          image: nginx:1.27
`);
          await k.rollout("app", "fl-k8s-0057");
        },
        failing: ["init"],
      },
    ],
  },

  // 058 — Prepare Shared Files
  "k8s-0058": {
    initial: [],
    async solve(k) {
      k.apply(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: fl-k8s-0058
  labels: { app: app }
spec:
  replicas: 1
  selector:
    matchLabels: { app: app }
  template:
    metadata:
      labels: { app: app }
    spec:
      terminationGracePeriodSeconds: 5
      volumes:
        - name: shared-data
          emptyDir: {}
      initContainers:
        - name: writer
          image: busybox:1.36
          command: ["sh", "-c", "echo 'hello from init' > /shared/index.html"]
          volumeMounts:
            - name: shared-data
              mountPath: /shared
      containers:
        - name: app
          image: nginx:1.27
          volumeMounts:
            - name: shared-data
              mountPath: /usr/share/nginx/html
`);
      await k.rollout("app", "fl-k8s-0058");
    },
    variants: [
      {
        name: "no init container and no volume (writer is a regular container)",
        async run(k) {
          k.apply(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: fl-k8s-0058
  labels: { app: app }
spec:
  replicas: 1
  selector:
    matchLabels: { app: app }
  template:
    metadata:
      labels: { app: app }
    spec:
      terminationGracePeriodSeconds: 5
      containers:
        - name: writer
          image: busybox:1.36
          command: ["sh", "-c", "while true; do echo writing; sleep 10; done"]
        - name: app
          image: nginx:1.27
`);
          await k.rollout("app", "fl-k8s-0058");
        },
        failing: ["init", "shared"],
      },
      {
        name: "init container present but main container does not mount the shared volume",
        async run(k) {
          k.apply(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: fl-k8s-0058
  labels: { app: app }
spec:
  replicas: 1
  selector:
    matchLabels: { app: app }
  template:
    metadata:
      labels: { app: app }
    spec:
      terminationGracePeriodSeconds: 5
      volumes:
        - name: shared-data
          emptyDir: {}
      initContainers:
        - name: writer
          image: busybox:1.36
          command: ["sh", "-c", "echo 'hello from init' > /shared/index.html"]
          volumeMounts:
            - name: shared-data
              mountPath: /shared
      containers:
        - name: app
          image: nginx:1.27
`);
          await k.rollout("app", "fl-k8s-0058");
        },
        failing: ["shared"],
      },
    ],
  },

  // 059 — Diagnose Failed Initialization
  "k8s-0059": {
    initial: [["deployment", "app", "fl-k8s-0059"]],
    async solve(k) {
      k.run(
        "patch",
        "deployment",
        "app",
        "-n",
        "fl-k8s-0059",
        "--type=json",
        "-p",
        JSON.stringify([
          {
            op: "replace",
            path: "/spec/template/spec/initContainers/0/command",
            value: ["sh", "-c", "echo ready && exit 0"],
          },
        ]),
      );
      await k.rollout("app", "fl-k8s-0059");
    },
    variants: [
      {
        name: "remove the init container instead of fixing it",
        async run(k) {
          k.run(
            "patch",
            "deployment",
            "app",
            "-n",
            "fl-k8s-0059",
            "--type=json",
            "-p",
            JSON.stringify([{ op: "remove", path: "/spec/template/spec/initContainers/0" }]),
          );
          await k.rollout("app", "fl-k8s-0059");
        },
        failing: ["init"],
      },
      {
        name: "add echo but still exit 1 (init container still fails)",
        async run(k) {
          k.run(
            "patch",
            "deployment",
            "app",
            "-n",
            "fl-k8s-0059",
            "--type=json",
            "-p",
            JSON.stringify([
              {
                op: "replace",
                path: "/spec/template/spec/initContainers/0/command",
                value: ["sh", "-c", "echo ready && exit 1"],
              },
            ]),
          );
          // Do not await rollout — the init container still fails so the rollout never completes.
        },
        failing: ["rollout"],
      },
    ],
  },

  // 060 — Application Startup Challenge
  "k8s-0060": {
    initial: [],
    async solve(k) {
      k.apply(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: platform
  namespace: fl-k8s-0060
  labels: { app: platform }
spec:
  replicas: 1
  selector:
    matchLabels: { app: platform }
  template:
    metadata:
      labels: { app: platform }
    spec:
      terminationGracePeriodSeconds: 5
      volumes:
        - name: config-vol
          emptyDir: {}
      initContainers:
        - name: config-loader
          image: busybox:1.36
          command: ["sh", "-c", "echo mode=production > /config/app.properties"]
          volumeMounts:
            - name: config-vol
              mountPath: /config
        - name: db-check
          image: busybox:1.36
          command: ["sh", "-c", "echo db ok"]
      containers:
        - name: app
          image: nginx:1.27
          volumeMounts:
            - name: config-vol
              mountPath: /etc/app
`);
      await k.rollout("platform", "fl-k8s-0060");
    },
    variants: [
      {
        name: "db-check init container missing (only config-loader)",
        async run(k) {
          k.apply(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: platform
  namespace: fl-k8s-0060
  labels: { app: platform }
spec:
  replicas: 1
  selector:
    matchLabels: { app: platform }
  template:
    metadata:
      labels: { app: platform }
    spec:
      terminationGracePeriodSeconds: 5
      volumes:
        - name: config-vol
          emptyDir: {}
      initContainers:
        - name: config-loader
          image: busybox:1.36
          command: ["sh", "-c", "echo mode=production > /config/app.properties"]
          volumeMounts:
            - name: config-vol
              mountPath: /config
      containers:
        - name: app
          image: nginx:1.27
          volumeMounts:
            - name: config-vol
              mountPath: /etc/app
`);
          await k.rollout("platform", "fl-k8s-0060");
        },
        failing: ["init-db-check"],
      },
      {
        name: "both init containers present but app does not mount config-vol",
        async run(k) {
          k.apply(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: platform
  namespace: fl-k8s-0060
  labels: { app: platform }
spec:
  replicas: 1
  selector:
    matchLabels: { app: platform }
  template:
    metadata:
      labels: { app: platform }
    spec:
      terminationGracePeriodSeconds: 5
      volumes:
        - name: config-vol
          emptyDir: {}
      initContainers:
        - name: config-loader
          image: busybox:1.36
          command: ["sh", "-c", "echo mode=production > /config/app.properties"]
          volumeMounts:
            - name: config-vol
              mountPath: /config
        - name: db-check
          image: busybox:1.36
          command: ["sh", "-c", "echo db ok"]
      containers:
        - name: app
          image: nginx:1.27
`);
          await k.rollout("platform", "fl-k8s-0060");
        },
        failing: ["shared"],
      },
    ],
  },
};
