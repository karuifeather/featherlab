/**
 * Executable learner behaviour for every Level 0 exercise, shared by the real-kind circuit
 * test. Each scenario acts the way a learner would: plain kubectl in the workstation, against
 * a freshly prepared exercise.
 *
 *   solve(k)       the reference solution; the exercise must then pass
 *   alternatives   other legitimate solutions that must also pass
 *   variants       plausible mistakes; each starts from a fresh baseline and must end
 *                  `failed`, with exactly the listed checks failing (and the rest passing),
 *                  which proves the checks are independent and catch partial solutions
 *   initial        objects setup must have created (verified before the baseline check)
 *
 * `k` is a small kubectl facade: `k.run(...args)`, `k.apply(yaml)`, `k.replace(yaml)`,
 * `k.rollout(name, ns)`, `k.ready(pod, ns)`, `k.until(label, fn)`.
 */

const NGINX = "nginx:1.27";

/**
 * Build the `k` facade over `exec(args, {input}) -> stdout`, which runs kubectl as the
 * learner would (the real-kind test routes it through the workstation container).
 */
export function createKubectlFacade(exec, { timeoutMs = 180_000, pollMs = 1_000 } = {}) {
  const k = {
    run: (...args) => exec(args),
    apply: (yaml) => exec(["apply", "-f", "-"], { input: yaml }),
    replace: (yaml) => exec(["replace", "--force", "-f", "-"], { input: yaml }),
    rollout: async (name, ns) =>
      exec(["rollout", "status", `deployment/${name}`, "-n", ns, `--timeout=${timeoutMs / 1000}s`]),
    ready: async (pod, ns) =>
      exec([
        "wait",
        "--for=condition=Ready",
        `pod/${pod}`,
        "-n",
        ns,
        `--timeout=${timeoutMs / 1000}s`,
      ]),
    /** Bounded poll: resolves once `fn()` is truthy, rejects with `label` after the deadline. */
    async until(label, fn) {
      const deadline = Date.now() + timeoutMs;
      let lastError;
      while (Date.now() < deadline) {
        try {
          if (await fn()) return;
        } catch (error) {
          lastError = error;
        }
        await new Promise((resolve) => setTimeout(resolve, pollMs));
      }
      throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ""}`);
    },
  };
  return k;
}

const podYaml = ({ name, namespace, labels, env = "", container = "app", port = "" }) => `
apiVersion: v1
kind: Pod
metadata:
  name: ${name}
  namespace: ${namespace}
  labels: ${JSON.stringify(labels)}
spec:
  terminationGracePeriodSeconds: 5
  containers:
    - name: ${container}
      image: ${NGINX}
${port}${env}`;

/**
 * Wait until a change that will never become Ready has been given a fair chance: the
 * controller observed it and every Pod of the newest ReplicaSet has been running for
 * `minRunningSeconds` (longer than the fixtures' readiness failure window). A stuck rollout
 * is the expected end state here, so waiting for the rollout itself would never finish.
 */
async function settled(k, name, ns, { minRunningSeconds = 12 } = {}) {
  await k.until(`${ns}/${name}: new Pods running long enough to be judged`, () => {
    const d = JSON.parse(k.run("get", "deployment", name, "-n", ns, "-o", "json"));
    if ((d.status?.observedGeneration ?? 0) < d.metadata.generation) return false;
    const revision = d.metadata.annotations?.["deployment.kubernetes.io/revision"];
    const selector = Object.entries(d.spec.selector.matchLabels)
      .map(([key, value]) => `${key}=${value}`)
      .join(",");
    const sets = JSON.parse(k.run("get", "replicasets", "-n", ns, "-l", selector, "-o", "json"));
    const newest = sets.items.find(
      (rs) => rs.metadata.annotations?.["deployment.kubernetes.io/revision"] === revision,
    );
    const hash = newest?.metadata.labels?.["pod-template-hash"];
    if (!hash) return false;
    const pods = JSON.parse(
      k.run("get", "pods", "-n", ns, "-l", `pod-template-hash=${hash}`, "-o", "json"),
    ).items;
    const runningFor = (pod) => {
      const started = pod.status?.containerStatuses?.[0]?.state?.running?.startedAt;
      return started ? (Date.now() - Date.parse(started)) / 1000 : -1;
    };
    return pods.length > 0 && pods.every((pod) => runningFor(pod) >= minRunningSeconds);
  });
}

const fix0005Probe = (port) =>
  `[{"op":"replace","path":"/spec/template/spec/containers/0/readinessProbe/httpGet/port","value":${JSON.stringify(port)}}]`;

const GATEWAY_FIXED = `
apiVersion: v1
kind: ConfigMap
metadata: { name: gateway-config, namespace: fl-k8s-0008 }
data:
  default.conf: |
    server {
        listen 80;
        server_name gateway.internal;
        location = /healthz { default_type text/plain; return 200 "ok\\n"; }
        location / { default_type text/plain; return 200 "gateway is up\\n"; }
    }
`;

function solve0010(k, { worker = "worker", legacy = "scale" } = {}) {
  const ns = "fl-k8s-0010";
  k.run("set", "image", "deployment/inventory-api", "api=nginx:1.27", "-n", ns);
  k.run(
    "patch",
    "deployment",
    "inventory-api",
    "-n",
    ns,
    "--type=json",
    "-p",
    fix0005Probe("http"),
  );
  k.run("scale", "deployment", "inventory-api", "--replicas=3", "-n", ns);
  k.apply(`
apiVersion: apps/v1
kind: Deployment
metadata: { name: inventory-worker, namespace: ${ns} }
spec:
  replicas: 1
  selector: { matchLabels: { app: inventory-worker } }
  template:
    metadata: { labels: { app: inventory-worker } }
    spec:
      containers:
        - name: ${worker}
          image: ${NGINX}
          resources: { requests: { cpu: 50m, memory: 32Mi }, limits: { memory: 64Mi } }
`);
  if (legacy === "scale")
    k.run("scale", "deployment", "inventory-api", "--replicas=0", "-n", `${ns}-legacy`);
  if (legacy === "delete") k.run("delete", "deployment", "inventory-api", "-n", `${ns}-legacy`);
}

export const LEVEL0_SCENARIOS = {
  "k8s-0001": {
    initial: [],
    async solve(k) {
      k.run("run", "web", `--image=${NGINX}`, "-n", "fl-k8s-0001");
      await k.ready("web", "fl-k8s-0001");
    },
    alternatives: [
      {
        name: "declarative manifest",
        async run(k) {
          k.apply(podYaml({ name: "web", namespace: "fl-k8s-0001", labels: { run: "web" } }));
          await k.ready("web", "fl-k8s-0001");
        },
      },
    ],
    variants: [
      {
        name: "Pod created in default instead of the exercise namespace",
        async run(k) {
          k.run("run", "web", `--image=${NGINX}`, "-n", "default");
          await k.ready("web", "default");
        },
        failing: ["exists", "image", "running", "ready"],
      },
      {
        name: "right name and namespace, wrong image",
        async run(k) {
          k.run("run", "web", "--image=nginx:1.27-alpine", "-n", "fl-k8s-0001");
          await k.ready("web", "fl-k8s-0001");
        },
        failing: ["image"],
      },
    ],
  },

  "k8s-0002": {
    initial: [],
    async solve(k) {
      const ns = "fl-k8s-0002";
      k.run("create", "deployment", "api", `--image=${NGINX}`, "--replicas=2", "-n", ns);
      k.run("label", "deployment", "api", "tier=backend", "-n", ns);
      await k.rollout("api", ns);
    },
    variants: [
      {
        name: "correct Deployment with the wrong replica count",
        async run(k) {
          const ns = "fl-k8s-0002";
          k.run("create", "deployment", "api", `--image=${NGINX}`, "--replicas=3", "-n", ns);
          k.run("label", "deployment", "api", "tier=backend", "-n", ns);
          await k.rollout("api", ns);
        },
        failing: ["desired", "available"],
      },
      {
        name: "label placed on the Pods instead of the Deployment",
        async run(k) {
          const ns = "fl-k8s-0002";
          k.apply(`
apiVersion: apps/v1
kind: Deployment
metadata: { name: api, namespace: ${ns} }
spec:
  replicas: 2
  selector: { matchLabels: { app: api } }
  template:
    metadata: { labels: { app: api, tier: backend } }
    spec: { containers: [{ name: nginx, image: ${NGINX} }] }
`);
          await k.rollout("api", ns);
        },
        failing: ["label"],
      },
    ],
  },

  "k8s-0003": {
    initial: [
      ["deployment", "catalog", "fl-k8s-0003-sandbox"],
      ["pod", "notes", "fl-k8s-0003-sandbox"],
      ["service", "catalog", "fl-k8s-0003"],
    ],
    async solve(k) {
      k.run(
        "create",
        "deployment",
        "catalog",
        `--image=${NGINX}`,
        "--replicas=2",
        "-n",
        "fl-k8s-0003",
      );
      await k.rollout("catalog", "fl-k8s-0003");
      k.run("delete", "deployment", "catalog", "-n", "fl-k8s-0003-sandbox", "--wait=true");
    },
    variants: [
      {
        name: "copied to the right namespace but left the misplaced copy",
        async run(k) {
          k.run(
            "create",
            "deployment",
            "catalog",
            `--image=${NGINX}`,
            "--replicas=2",
            "-n",
            "fl-k8s-0003",
          );
          await k.rollout("catalog", "fl-k8s-0003");
        },
        failing: ["removed"],
      },
      {
        name: "deleted the whole sandbox namespace, taking the neighbour with it",
        async run(k) {
          k.run(
            "create",
            "deployment",
            "catalog",
            `--image=${NGINX}`,
            "--replicas=2",
            "-n",
            "fl-k8s-0003",
          );
          await k.rollout("catalog", "fl-k8s-0003");
          k.run("delete", "namespace", "fl-k8s-0003-sandbox", "--wait=true", "--timeout=90s");
        },
        failing: ["neighbour"],
      },
    ],
  },

  "k8s-0004": {
    initial: [["deployment", "storefront", "fl-k8s-0004"]],
    async solve(k) {
      k.run("set", "image", "deployment/storefront", `web=${NGINX}`, "-n", "fl-k8s-0004");
      await k.rollout("storefront", "fl-k8s-0004");
    },
    variants: [
      {
        name: "image fixed but scaled down to 1 replica",
        async run(k) {
          k.run("set", "image", "deployment/storefront", `web=${NGINX}`, "-n", "fl-k8s-0004");
          k.run("scale", "deployment", "storefront", "--replicas=1", "-n", "fl-k8s-0004");
          await k.rollout("storefront", "fl-k8s-0004");
        },
        failing: ["rollout"],
      },
      {
        name: "a working image, but not the team's standard one",
        async run(k) {
          k.run(
            "set",
            "image",
            "deployment/storefront",
            "web=nginx:1.27-alpine",
            "-n",
            "fl-k8s-0004",
          );
          await k.rollout("storefront", "fl-k8s-0004");
        },
        failing: ["image"],
      },
    ],
  },

  "k8s-0005": {
    initial: [
      ["deployment", "status-page", "fl-k8s-0005"],
      ["service", "status-page", "fl-k8s-0005"],
    ],
    async solve(k) {
      k.run(
        "patch",
        "deployment",
        "status-page",
        "-n",
        "fl-k8s-0005",
        "--type=json",
        "-p",
        fix0005Probe(80),
      );
      await k.rollout("status-page", "fl-k8s-0005");
    },
    alternatives: [
      {
        name: "probe pointed at the named port",
        async run(k) {
          k.run(
            "patch",
            "deployment",
            "status-page",
            "-n",
            "fl-k8s-0005",
            "--type=json",
            "-p",
            fix0005Probe("http"),
          );
          await k.rollout("status-page", "fl-k8s-0005");
        },
      },
    ],
    variants: [
      {
        name: "readiness probe deleted instead of fixed",
        async run(k) {
          k.run(
            "patch",
            "deployment",
            "status-page",
            "-n",
            "fl-k8s-0005",
            "--type=json",
            "-p",
            '[{"op":"remove","path":"/spec/template/spec/containers/0/readinessProbe"}]',
          );
          await k.rollout("status-page", "fl-k8s-0005");
        },
        failing: ["probe"],
      },
      {
        name: "port fixed but the probe now checks a path nginx does not serve",
        async run(k) {
          k.run(
            "patch",
            "deployment",
            "status-page",
            "-n",
            "fl-k8s-0005",
            "--type=json",
            "-p",
            '[{"op":"replace","path":"/spec/template/spec/containers/0/readinessProbe/httpGet","value":{"path":"/healthz","port":80}}]',
          );
          await settled(k, "status-page", "fl-k8s-0005");
        },
        failing: ["rollout"],
      },
    ],
  },

  "k8s-0006": {
    initial: [["deployment", "ledger", "fl-k8s-0006"]],
    async solve(k) {
      k.run(
        "set",
        "resources",
        "deployment",
        "ledger",
        "-c",
        "app",
        "-n",
        "fl-k8s-0006",
        "--requests=cpu=100m,memory=64Mi",
        "--limits=cpu=250m,memory=128Mi",
      );
      await k.rollout("ledger", "fl-k8s-0006");
    },
    alternatives: [
      {
        name: "equivalent quantities written differently",
        async run(k) {
          k.run(
            "set",
            "resources",
            "deployment",
            "ledger",
            "-c",
            "app",
            "-n",
            "fl-k8s-0006",
            "--requests=cpu=0.1,memory=67108864",
            "--limits=cpu=0.25,memory=134217728",
          );
          await k.rollout("ledger", "fl-k8s-0006");
        },
      },
    ],
    variants: [
      {
        name: "set resources without -c changes the helper container too",
        async run(k) {
          k.run(
            "set",
            "resources",
            "deployment",
            "ledger",
            "-n",
            "fl-k8s-0006",
            "--requests=cpu=100m,memory=64Mi",
            "--limits=cpu=250m,memory=128Mi",
          );
          await k.rollout("ledger", "fl-k8s-0006");
        },
        failing: ["metrics-unchanged"],
      },
      {
        name: "limits only, so requests silently default to the limits",
        async run(k) {
          k.run(
            "set",
            "resources",
            "deployment",
            "ledger",
            "-c",
            "app",
            "-n",
            "fl-k8s-0006",
            "--limits=cpu=250m,memory=128Mi",
          );
          await k.rollout("ledger", "fl-k8s-0006");
        },
        failing: ["app-resources"],
      },
    ],
  },

  "k8s-0007": {
    initial: [
      ["pod", "audit-log", "fl-k8s-0007"],
      ["service", "audit-log", "fl-k8s-0007"],
    ],
    async solve(k) {
      const saved = k.run("get", "pod", "audit-log", "-n", "fl-k8s-0007", "-o", "yaml");
      k.replace(saved.replace(/value: info/, "value: debug"));
      await k.ready("audit-log", "fl-k8s-0007");
    },
    variants: [
      {
        name: "recreated with kubectl run: env set, but labels, port and container name lost",
        async run(k) {
          k.run("delete", "pod", "audit-log", "-n", "fl-k8s-0007", "--wait=true");
          k.run(
            "run",
            "audit-log",
            `--image=${NGINX}`,
            "--env=LOG_LEVEL=debug",
            "--labels=app=audit-log",
            "-n",
            "fl-k8s-0007",
          );
          await k.ready("audit-log", "fl-k8s-0007");
        },
        failing: ["env", "image", "routed"],
      },
      {
        name: "recreated faithfully but kept the old log level",
        async run(k) {
          const saved = k.run("get", "pod", "audit-log", "-n", "fl-k8s-0007", "-o", "yaml");
          k.replace(saved.replace(/value: info/, "value: warn"));
          await k.ready("audit-log", "fl-k8s-0007");
        },
        failing: ["env"],
      },
    ],
  },

  "k8s-0008": {
    initial: [
      ["deployment", "gateway", "fl-k8s-0008"],
      ["configmap", "gateway-config", "fl-k8s-0008"],
    ],
    async solve(k) {
      k.apply(GATEWAY_FIXED);
      k.run("rollout", "restart", "deployment/gateway", "-n", "fl-k8s-0008");
      await k.rollout("gateway", "fl-k8s-0008");
    },
    variants: [
      {
        name: "ConfigMap volume removed: nginx starts with its default site",
        async run(k) {
          k.run(
            "patch",
            "deployment",
            "gateway",
            "-n",
            "fl-k8s-0008",
            "--type=json",
            "-p",
            '[{"op":"remove","path":"/spec/template/spec/containers/0/volumeMounts"},{"op":"remove","path":"/spec/template/spec/volumes"}]',
          );
          await settled(k, "gateway", "fl-k8s-0008");
        },
        failing: ["config", "rollout"],
      },
      {
        name: "config fixed but the readiness probe was removed",
        async run(k) {
          k.apply(GATEWAY_FIXED);
          k.run(
            "patch",
            "deployment",
            "gateway",
            "-n",
            "fl-k8s-0008",
            "--type=json",
            "-p",
            '[{"op":"remove","path":"/spec/template/spec/containers/0/readinessProbe"}]',
          );
          await k.rollout("gateway", "fl-k8s-0008");
        },
        failing: ["probe"],
      },
    ],
  },

  "k8s-0009": {
    initial: [
      ["deployment", "orders", "fl-k8s-0009"],
      ["service", "orders", "fl-k8s-0009"],
      ["deployment", "payments", "fl-k8s-0009"],
      ["configmap", "payments-config", "fl-k8s-0009"],
    ],
    async solve(k) {
      const ns = "fl-k8s-0009";
      k.run("patch", "service", "orders", "-n", ns, "-p", '{"spec":{"selector":{"app":"orders"}}}');
      k.run(
        "patch",
        "deployment",
        "payments",
        "-n",
        ns,
        "--type=json",
        "-p",
        '[{"op":"replace","path":"/spec/template/spec/containers/0/env/0/valueFrom/configMapKeyRef/name","value":"payments-config"}]',
      );
      await k.rollout("payments", ns);
      await k.rollout("orders", ns);
    },
    variants: [
      {
        name: "only the orders Service fixed",
        async run(k) {
          k.run(
            "patch",
            "service",
            "orders",
            "-n",
            "fl-k8s-0009",
            "-p",
            '{"spec":{"selector":{"app":"orders"}}}',
          );
          await k.rollout("orders", "fl-k8s-0009");
        },
        failing: ["payments-env", "payments-available"],
      },
      {
        name: "payments unblocked by creating the misspelled ConfigMap; orders untouched",
        async run(k) {
          k.run(
            "create",
            "configmap",
            "payment-config",
            "--from-literal=mode=live",
            "-n",
            "fl-k8s-0009",
          );
          await k.rollout("payments", "fl-k8s-0009");
        },
        failing: ["orders-routed", "payments-env"],
      },
    ],
  },

  "k8s-0010": {
    initial: [
      ["deployment", "inventory-api", "fl-k8s-0010"],
      ["service", "inventory-api", "fl-k8s-0010"],
      ["deployment", "inventory-api", "fl-k8s-0010-legacy"],
    ],
    async solve(k) {
      solve0010(k);
      await k.rollout("inventory-api", "fl-k8s-0010");
      await k.rollout("inventory-worker", "fl-k8s-0010");
    },
    variants: [
      {
        name: "legacy release deleted instead of scaled to zero",
        async run(k) {
          solve0010(k, { legacy: "delete" });
          await k.rollout("inventory-api", "fl-k8s-0010");
          await k.rollout("inventory-worker", "fl-k8s-0010");
        },
        failing: ["legacy-kept", "legacy-scaled"],
      },
      {
        name: "worker container keeps the generated name",
        async run(k) {
          solve0010(k, { worker: "nginx" });
          await k.rollout("inventory-api", "fl-k8s-0010");
          await k.rollout("inventory-worker", "fl-k8s-0010");
        },
        failing: ["worker-image", "worker-resources"],
      },
      {
        name: "only the image fixed: the probe still names a missing port",
        async run(k) {
          k.run("set", "image", "deployment/inventory-api", "api=nginx:1.27", "-n", "fl-k8s-0010");
          await settled(k, "inventory-api", "fl-k8s-0010");
        },
        failing: [
          "api-rollout",
          "worker-placed",
          "worker-image",
          "worker-resources",
          "worker-rollout",
          "legacy-scaled",
        ],
      },
    ],
  },

  // ── Level 0 foundations (M5.1 revision) ──────────────────────────────────
  "k8s-0011": {
    initial: [
      ["pod", "alpha", "fl-k8s-0011"],
      ["pod", "bravo", "fl-k8s-0011"],
    ],
    async solve(k) {
      await k.ready("alpha", "fl-k8s-0011");
      await k.ready("bravo", "fl-k8s-0011");
      // Find the Pod from its log, as the learner must.
      const flagged = ["alpha", "bravo"].find((pod) =>
        k.run("logs", pod, "-n", "fl-k8s-0011").includes("status: needs-review"),
      );
      k.run("label", "pod", flagged, "review=needed", "-n", "fl-k8s-0011");
    },
    variants: [
      {
        name: "labelled the Pod whose log says ok",
        async run(k) {
          await k.ready("alpha", "fl-k8s-0011");
          await k.ready("bravo", "fl-k8s-0011");
          k.run("label", "pod", "alpha", "review=needed", "-n", "fl-k8s-0011");
        },
        failing: ["labelled", "other-unlabelled"],
      },
    ],
  },

  "k8s-0012": {
    initial: [],
    async solve(k) {
      k.apply(`
apiVersion: v1
kind: Pod
metadata:
  name: notes
  namespace: fl-k8s-0012
  labels: { app: notes, tier: frontend }
spec:
  containers:
    - { name: web, image: ${NGINX} }
`);
      await k.ready("notes", "fl-k8s-0012");
    },
    variants: [
      {
        name: "kubectl run with the right labels, but the container is named notes",
        async run(k) {
          k.run(
            "run",
            "notes",
            `--image=${NGINX}`,
            "--labels=app=notes,tier=frontend",
            "-n",
            "fl-k8s-0012",
          );
          await k.ready("notes", "fl-k8s-0012");
        },
        failing: ["container"],
      },
    ],
  },

  "k8s-0013": {
    initial: [
      ["pod", "web", "fl-k8s-0013-sandbox"],
      ["pod", "scratch", "fl-k8s-0013-sandbox"],
    ],
    async solve(k) {
      k.run("run", "web", `--image=${NGINX}`, "-n", "fl-k8s-0013");
      k.run("delete", "pod", "scratch", "-n", "fl-k8s-0013-sandbox", "--wait=true");
      await k.ready("web", "fl-k8s-0013");
      await k.ready("web", "fl-k8s-0013-sandbox");
    },
    variants: [
      {
        name: "deleted the sandbox's web instead of scratch",
        async run(k) {
          k.run("run", "web", `--image=${NGINX}`, "-n", "fl-k8s-0013");
          k.run("delete", "pod", "web", "-n", "fl-k8s-0013-sandbox", "--wait=true");
          await k.ready("web", "fl-k8s-0013");
          await k.ready("scratch", "fl-k8s-0013-sandbox");
        },
        failing: ["sandbox-web-kept", "scratch-removed"],
      },
    ],
  },

  "k8s-0014": {
    initial: [
      ["pod", "cart-a", "fl-k8s-0014"],
      ["pod", "search-a", "fl-k8s-0014"],
    ],
    async solve(k) {
      const ns = "fl-k8s-0014";
      k.run("label", "pod", "cart-a", "cart-b", "search-a", "env=prod", "--overwrite", "-n", ns);
      k.run("label", "pod", "search-a", "debug-", "-n", ns);
      k.run("run", "cart-c", `--image=${NGINX}`, "--labels=app=cart,env=prod", "-n", ns);
      await k.ready("cart-c", ns);
      const selected = k.run("get", "pods", "-n", ns, "-l", "app=cart,env=prod", "-o", "name");
      if (selected.trim().split("\n").length !== 3)
        throw new Error(`selector returned ${selected}`);
    },
    variants: [
      {
        name: "promoted every Pod but left the debug label on search-a",
        async run(k) {
          const ns = "fl-k8s-0014";
          k.run(
            "label",
            "pod",
            "cart-a",
            "cart-b",
            "search-a",
            "env=prod",
            "--overwrite",
            "-n",
            ns,
          );
          k.run("run", "cart-c", `--image=${NGINX}`, "--labels=app=cart,env=prod", "-n", ns);
          await k.ready("cart-c", ns);
        },
        failing: ["search-debug-removed"],
      },
    ],
  },

  "k8s-0015": {
    initial: [
      ["deployment", "frontend", "fl-k8s-0015"],
      ["deployment", "worker", "fl-k8s-0015"],
    ],
    async solve(k) {
      k.run("scale", "deployment", "frontend", "--replicas=3", "-n", "fl-k8s-0015");
      k.run("scale", "deployment", "worker", "--replicas=1", "-n", "fl-k8s-0015");
      await k.rollout("frontend", "fl-k8s-0015");
      await k.rollout("worker", "fl-k8s-0015");
    },
    alternatives: [
      {
        name: "declarative: replicas changed in the object with patch",
        async run(k) {
          k.run(
            "patch",
            "deployment",
            "frontend",
            "-n",
            "fl-k8s-0015",
            "-p",
            '{"spec":{"replicas":3}}',
          );
          k.run(
            "patch",
            "deployment",
            "worker",
            "-n",
            "fl-k8s-0015",
            "-p",
            '{"spec":{"replicas":1}}',
          );
          await k.rollout("frontend", "fl-k8s-0015");
          await k.rollout("worker", "fl-k8s-0015");
        },
      },
    ],
    variants: [
      {
        name: "only the frontend scaled",
        async run(k) {
          k.run("scale", "deployment", "frontend", "--replicas=3", "-n", "fl-k8s-0015");
          await k.rollout("frontend", "fl-k8s-0015");
          await k.rollout("worker", "fl-k8s-0015");
        },
        failing: ["worker-desired", "worker-available"],
      },
    ],
  },

  "k8s-0016": {
    initial: [["deployment", "reports", "fl-k8s-0016"]],
    async solve(k) {
      k.run("scale", "deployment", "reports", "--replicas=2", "-n", "fl-k8s-0016");
      k.run("label", "deployment", "reports", "team=analytics", "-n", "fl-k8s-0016");
      await k.rollout("reports", "fl-k8s-0016");
    },
    variants: [
      {
        name: "team label put on the Pod template instead of the Deployment",
        async run(k) {
          k.run(
            "patch",
            "deployment",
            "reports",
            "-n",
            "fl-k8s-0016",
            "-p",
            '{"spec":{"replicas":2,"template":{"metadata":{"labels":{"team":"analytics"}}}}}',
          );
          await k.rollout("reports", "fl-k8s-0016");
        },
        failing: ["labels"],
      },
    ],
  },

  "k8s-0017": {
    initial: [
      ["deployment", "greeter", "fl-k8s-0017"],
      ["pod", "greeter-check", "fl-k8s-0017-sandbox"],
    ],
    async solve(k) {
      const ns = "fl-k8s-0017";
      k.run("scale", "deployment", "greeter", "--replicas=2", "-n", ns);
      k.run("label", "deployment", "greeter", "app=greeter", "--overwrite", "-n", ns);
      k.run("run", "greeter-check", `--image=${NGINX}`, "-n", ns);
      k.run("delete", "pod", "greeter-check", "-n", `${ns}-sandbox`, "--wait=true");
      await k.rollout("greeter", ns);
      await k.ready("greeter-check", ns);
    },
    variants: [
      {
        name: "recreated the check Pod but left the misplaced copy",
        async run(k) {
          const ns = "fl-k8s-0017";
          k.run("scale", "deployment", "greeter", "--replicas=2", "-n", ns);
          k.run("label", "deployment", "greeter", "app=greeter", "--overwrite", "-n", ns);
          k.run("run", "greeter-check", `--image=${NGINX}`, "-n", ns);
          await k.rollout("greeter", ns);
          await k.ready("greeter-check", ns);
        },
        failing: ["sandbox-clean"],
      },
    ],
  },

  "k8s-0018": {
    initial: [
      ["deployment", "shop", "fl-k8s-0018"],
      ["pod", "batch-1", "fl-k8s-0018"],
      ["pod", "batch-2", "fl-k8s-0018"],
    ],
    async solve(k) {
      const ns = "fl-k8s-0018";
      k.run("scale", "deployment", "shop", "--replicas=3", "-n", ns);
      k.run("label", "deployment", "shop", "env=prod", "--overwrite", "-n", ns);
      await k.ready("batch-1", ns);
      await k.ready("batch-2", ns);
      const payments = ["batch-1", "batch-2"].find((pod) =>
        k.run("logs", pod, "-n", ns).includes("payments"),
      );
      k.run("label", "pod", payments, "team=payments", "-n", ns);
      k.apply(`
apiVersion: v1
kind: Pod
metadata:
  name: status
  namespace: ${ns}-tools
  labels: { app: status }
spec:
  containers:
    - { name: probe, image: ${NGINX} }
`);
      await k.rollout("shop", ns);
      await k.ready("status", `${ns}-tools`);
    },
    variants: [
      {
        name: "status Pod created with kubectl run: container not named probe",
        async run(k) {
          const ns = "fl-k8s-0018";
          k.run("scale", "deployment", "shop", "--replicas=3", "-n", ns);
          k.run("label", "deployment", "shop", "env=prod", "--overwrite", "-n", ns);
          k.run("label", "pod", "batch-2", "team=payments", "-n", ns);
          k.run("run", "status", `--image=${NGINX}`, "--labels=app=status", "-n", `${ns}-tools`);
          await k.rollout("shop", ns);
          await k.ready("batch-2", ns);
          await k.ready("batch-1", ns);
          await k.ready("status", `${ns}-tools`);
        },
        failing: ["status-container"],
      },
    ],
  },

  // ── Level 1: Deployment Lifecycle & Rollout Fluency (M5.3) ─────────────────

  "k8s-0019": {
    initial: [["deployment", "catalog", "fl-k8s-0019"]],
    async solve(k) {
      k.run(
        "patch",
        "deployment",
        "catalog",
        "-n",
        "fl-k8s-0019",
        "--type=merge",
        "-p",
        '{"spec":{"template":{"metadata":{"labels":{"tier":"backend"}}}}}',
      );
      await k.rollout("catalog", "fl-k8s-0019");
    },
    variants: [
      {
        name: "tier=backend added to Deployment metadata labels, not pod template",
        async run(k) {
          k.run("label", "deployment", "catalog", "tier=backend", "-n", "fl-k8s-0019");
          await k.rollout("catalog", "fl-k8s-0019");
        },
        failing: ["tier-label"],
      },
    ],
  },

  "k8s-0020": {
    initial: [["deployment", "frontend", "fl-k8s-0020"]],
    async solve(k) {
      k.run(
        "patch",
        "deployment",
        "frontend",
        "-n",
        "fl-k8s-0020",
        "--type=merge",
        "-p",
        '{"spec":{"template":{"metadata":{"labels":{"env":"staging"}}}}}',
      );
      await k.rollout("frontend", "fl-k8s-0020");
    },
    variants: [
      {
        name: "env=staging labeled on Deployment metadata, not pod template",
        async run(k) {
          k.run(
            "label",
            "deployment",
            "frontend",
            "env=staging",
            "--overwrite",
            "-n",
            "fl-k8s-0020",
          );
          await k.rollout("frontend", "fl-k8s-0020");
        },
        failing: ["env-label"],
      },
    ],
  },

  "k8s-0021": {
    initial: [["deployment", "orders", "fl-k8s-0021"]],
    async solve(k) {
      k.run("scale", "deployment", "orders", "--replicas=4", "-n", "fl-k8s-0021");
      k.run(
        "annotate",
        "deployment",
        "orders",
        "featherlab.dev/scale-reason=high-availability",
        "-n",
        "fl-k8s-0021",
      );
      await k.rollout("orders", "fl-k8s-0021");
    },
    variants: [
      {
        name: "scaled to 4 but scale-reason annotation not added",
        async run(k) {
          k.run("scale", "deployment", "orders", "--replicas=4", "-n", "fl-k8s-0021");
          await k.rollout("orders", "fl-k8s-0021");
        },
        failing: ["scale-annotation"],
      },
    ],
  },

  "k8s-0022": {
    initial: [],
    async solve(k) {
      k.apply(
        "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: api-server\n  namespace: fl-k8s-0022\n  labels:\n    app: api-server\nspec:\n  replicas: 2\n  selector:\n    matchLabels:\n      app: api-server\n  template:\n    metadata:\n      labels:\n        app: api-server\n        version: v1\n    spec:\n      terminationGracePeriodSeconds: 2\n      containers:\n        - name: api\n          image: nginx:1.27\n",
      );
      await k.rollout("api-server", "fl-k8s-0022");
    },
    variants: [
      {
        name: "container left as default name (nginx) instead of renamed to api",
        async run(k) {
          k.apply(
            "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: api-server\n  namespace: fl-k8s-0022\n  labels:\n    app: api-server\nspec:\n  replicas: 2\n  selector:\n    matchLabels:\n      app: api-server\n  template:\n    metadata:\n      labels:\n        app: api-server\n        version: v1\n    spec:\n      terminationGracePeriodSeconds: 2\n      containers:\n        - name: nginx\n          image: nginx:1.27\n",
          );
          await k.rollout("api-server", "fl-k8s-0022");
        },
        failing: ["image"],
      },
    ],
  },

  "k8s-0023": {
    initial: [["deployment", "storefront", "fl-k8s-0023"]],
    async solve(k) {
      k.run("set", "image", "deployment/storefront", "web=nginx:1.27-alpine", "-n", "fl-k8s-0023");
      await k.rollout("storefront", "fl-k8s-0023");
    },
    variants: [
      {
        name: "image updated to wrong tag (1.26 instead of 1.27-alpine)",
        async run(k) {
          k.run("set", "image", "deployment/storefront", "web=nginx:1.26", "-n", "fl-k8s-0023");
          await k.rollout("storefront", "fl-k8s-0023");
        },
        failing: ["image"],
      },
    ],
  },

  "k8s-0024": {
    initial: [["deployment", "payment-api", "fl-k8s-0024"]],
    async solve(k) {
      k.run("set", "image", "deployment/payment-api", "app=nginx:1.27-alpine", "-n", "fl-k8s-0024");
      await k.rollout("payment-api", "fl-k8s-0024");
    },
    variants: [
      {
        name: "image updated to wrong tag (1.26 instead of 1.27-alpine)",
        async run(k) {
          k.run("set", "image", "deployment/payment-api", "app=nginx:1.26", "-n", "fl-k8s-0024");
          await k.rollout("payment-api", "fl-k8s-0024");
        },
        failing: ["image"],
      },
    ],
  },

  "k8s-0025": {
    initial: [["deployment", "notification-svc", "fl-k8s-0025"]],
    async solve(k) {
      k.run(
        "set",
        "image",
        "deployment/notification-svc",
        "web=nginx:1.27-alpine",
        "-n",
        "fl-k8s-0025",
      );
      await k.rollout("notification-svc", "fl-k8s-0025");
    },
    variants: [
      {
        name: "image updated to wrong tag (1.26 instead of 1.27-alpine)",
        async run(k) {
          k.run(
            "set",
            "image",
            "deployment/notification-svc",
            "web=nginx:1.26",
            "-n",
            "fl-k8s-0025",
          );
          await k.rollout("notification-svc", "fl-k8s-0025");
        },
        failing: ["image"],
      },
    ],
  },

  "k8s-0026": {
    initial: [["deployment", "billing", "fl-k8s-0026"]],
    async solve(k) {
      k.run(
        "patch",
        "deployment",
        "billing",
        "-n",
        "fl-k8s-0026",
        "--type=merge",
        "-p",
        '{"spec":{"strategy":{"type":"RollingUpdate","rollingUpdate":{"maxSurge":1,"maxUnavailable":0}}}}',
      );
      await k.rollout("billing", "fl-k8s-0026");
    },
    variants: [
      {
        name: "changed to RollingUpdate but maxUnavailable=1 instead of 0",
        async run(k) {
          k.run(
            "patch",
            "deployment",
            "billing",
            "-n",
            "fl-k8s-0026",
            "--type=merge",
            "-p",
            '{"spec":{"strategy":{"type":"RollingUpdate","rollingUpdate":{"maxSurge":1,"maxUnavailable":1}}}}',
          );
          await k.rollout("billing", "fl-k8s-0026");
        },
        failing: ["strategy"],
      },
    ],
  },

  "k8s-0027": {
    initial: [["deployment", "inventory", "fl-k8s-0027"]],
    async solve(k) {
      k.run(
        "patch",
        "deployment",
        "inventory",
        "-n",
        "fl-k8s-0027",
        "--type=merge",
        "-p",
        '{"spec":{"strategy":{"type":"RollingUpdate","rollingUpdate":{"maxSurge":1,"maxUnavailable":1}}}}',
      );
      await k.rollout("inventory", "fl-k8s-0027");
    },
    variants: [
      {
        name: "maxSurge=1 set but maxUnavailable=0 instead of 1",
        async run(k) {
          k.run(
            "patch",
            "deployment",
            "inventory",
            "-n",
            "fl-k8s-0027",
            "--type=merge",
            "-p",
            '{"spec":{"strategy":{"type":"RollingUpdate","rollingUpdate":{"maxSurge":1,"maxUnavailable":0}}}}',
          );
          await k.rollout("inventory", "fl-k8s-0027");
        },
        failing: ["strategy"],
      },
    ],
  },

  "k8s-0028": {
    initial: [["deployment", "reports", "fl-k8s-0028"]],
    async solve(k) {
      k.run("set", "image", "deployment/reports", "app=nginx:1.27-alpine", "-n", "fl-k8s-0028");
      k.run(
        "annotate",
        "deployment",
        "reports",
        "kubernetes.io/change-cause=upgrade to nginx 1.27-alpine",
        "--overwrite",
        "-n",
        "fl-k8s-0028",
      );
      await k.rollout("reports", "fl-k8s-0028");
    },
    variants: [
      {
        name: "image updated but change-cause annotation has wrong value",
        async run(k) {
          k.run("set", "image", "deployment/reports", "app=nginx:1.27-alpine", "-n", "fl-k8s-0028");
          k.run(
            "annotate",
            "deployment",
            "reports",
            "kubernetes.io/change-cause=upgraded nginx",
            "--overwrite",
            "-n",
            "fl-k8s-0028",
          );
          await k.rollout("reports", "fl-k8s-0028");
        },
        failing: ["change-cause"],
      },
    ],
  },

  "k8s-0029": {
    initial: [["deployment", "search", "fl-k8s-0029"]],
    async solve(k) {
      k.run("set", "image", "deployment/search", "app=nginx:1.27-alpine", "-n", "fl-k8s-0029");
      k.run("scale", "deployment", "search", "--replicas=3", "-n", "fl-k8s-0029");
      k.run("rollout", "resume", "deployment/search", "-n", "fl-k8s-0029");
      await k.rollout("search", "fl-k8s-0029");
    },
    variants: [
      {
        name: "resumed and scaled to 3 but image not updated to nginx:1.27-alpine",
        async run(k) {
          k.run("scale", "deployment", "search", "--replicas=3", "-n", "fl-k8s-0029");
          k.run("rollout", "resume", "deployment/search", "-n", "fl-k8s-0029");
          await k.rollout("search", "fl-k8s-0029");
        },
        failing: ["image"],
      },
    ],
  },

  "k8s-0030": {
    initial: [["deployment", "gateway", "fl-k8s-0030"]],
    async solve(k) {
      k.run("rollout", "undo", "deployment/gateway", "-n", "fl-k8s-0030");
      await k.rollout("gateway", "fl-k8s-0030");
    },
    variants: [
      {
        name: "image corrected but to wrong tag (nginx:1.26 not nginx:1.27)",
        async run(k) {
          k.run("set", "image", "deployment/gateway", "proxy=nginx:1.26", "-n", "fl-k8s-0030");
          await k.rollout("gateway", "fl-k8s-0030");
        },
        failing: ["image"],
      },
    ],
  },

  "k8s-0031": {
    initial: [["deployment", "catalog-api", "fl-k8s-0031"]],
    async solve(k) {
      k.run("rollout", "undo", "deployment/catalog-api", "--to-revision=2", "-n", "fl-k8s-0031");
      await k.rollout("catalog-api", "fl-k8s-0031");
    },
    variants: [
      {
        name: "rolled back to revision 1 (nginx:1.27) instead of revision 2 (nginx:1.27-alpine)",
        async run(k) {
          k.run(
            "rollout",
            "undo",
            "deployment/catalog-api",
            "--to-revision=1",
            "-n",
            "fl-k8s-0031",
          );
          await k.rollout("catalog-api", "fl-k8s-0031");
        },
        failing: ["image"],
      },
    ],
  },

  "k8s-0032": {
    initial: [["deployment", "auth", "fl-k8s-0032"]],
    async solve(k) {
      k.run("set", "image", "deployment/auth", "server=nginx:1.27", "-n", "fl-k8s-0032");
      await k.rollout("auth", "fl-k8s-0032");
    },
    variants: [
      {
        name: "image corrected but to wrong tag (nginx:1.26 not nginx:1.27)",
        async run(k) {
          k.run("set", "image", "deployment/auth", "server=nginx:1.26", "-n", "fl-k8s-0032");
          await k.rollout("auth", "fl-k8s-0032");
        },
        failing: ["image"],
      },
    ],
  },

  "k8s-0033": {
    initial: [["configmap", "legacy-manifest", "fl-k8s-0033"]],
    async solve(k) {
      k.apply(
        "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: legacy-worker\n  namespace: fl-k8s-0033\n  labels:\n    app: legacy-worker\nspec:\n  replicas: 1\n  selector:\n    matchLabels:\n      app: legacy-worker\n  template:\n    metadata:\n      labels:\n        app: legacy-worker\n    spec:\n      terminationGracePeriodSeconds: 2\n      containers:\n        - name: worker\n          image: nginx:1.27\n",
      );
      await k.rollout("legacy-worker", "fl-k8s-0033");
    },
    variants: [
      {
        name: "Deployment created but container named app instead of worker",
        async run(k) {
          k.apply(
            "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: legacy-worker\n  namespace: fl-k8s-0033\n  labels:\n    app: legacy-worker\nspec:\n  replicas: 1\n  selector:\n    matchLabels:\n      app: legacy-worker\n  template:\n    metadata:\n      labels:\n        app: legacy-worker\n    spec:\n      terminationGracePeriodSeconds: 2\n      containers:\n        - name: app\n          image: nginx:1.27\n",
          );
          await k.rollout("legacy-worker", "fl-k8s-0033");
        },
        failing: ["image"],
      },
    ],
  },

  "k8s-0034": {
    initial: [["deployment", "platform", "fl-k8s-0034"]],
    async solve(k) {
      k.run("rollout", "resume", "deployment/platform", "-n", "fl-k8s-0034");
      await k.until("platform: revision 3 created after resume", () => {
        const rev = k.run(
          "get",
          "deployment",
          "platform",
          "-n",
          "fl-k8s-0034",
          "-o",
          "jsonpath={.metadata.annotations.deployment\\.kubernetes\\.io/revision}",
        );
        return rev.trim() === "3";
      });
      k.run("rollout", "undo", "deployment/platform", "-n", "fl-k8s-0034");
      await k.rollout("platform", "fl-k8s-0034");
    },
    variants: [
      {
        name: "resumed and rolled back to revision 1 (nginx:1.27) instead of revision 2 (nginx:1.27-alpine)",
        async run(k) {
          k.run("rollout", "resume", "deployment/platform", "-n", "fl-k8s-0034");
          await k.until("platform: revision 3 created after resume", () => {
            const rev = k.run(
              "get",
              "deployment",
              "platform",
              "-n",
              "fl-k8s-0034",
              "-o",
              "jsonpath={.metadata.annotations.deployment\\.kubernetes\\.io/revision}",
            );
            return rev.trim() === "3";
          });
          k.run("rollout", "undo", "deployment/platform", "--to-revision=1", "-n", "fl-k8s-0034");
          await k.rollout("platform", "fl-k8s-0034");
        },
        failing: ["image"],
      },
    ],
  },
};
