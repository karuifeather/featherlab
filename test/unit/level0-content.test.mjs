import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../../src/app.mjs";
import { createFakeCluster } from "../helpers/fake-cluster.mjs";

/**
 * Every Level 0 exercise, graded by its real checks against the state its real setup
 * creates. The fake cluster runs no controllers, so "solving" here edits objects and fills in
 * the status a converged cluster would report. The same exercises are solved for real by
 * test/integration/level0-circuit.test.mjs; these tests pin the grading logic down
 * precisely and run in milliseconds.
 *
 * For each exercise: the fresh baseline fails, a solved state passes, a meaningful partial
 * solution fails exactly the expected checks, and revisiting after a switch starts unsolved.
 */
const quiet = { warn() {}, error() {} };

/** The status a Deployment reports once its rollout has fully converged. */
function rolledOut(d) {
  const replicas = d.spec.replicas ?? 1;
  d.metadata.generation = 2;
  d.status = {
    observedGeneration: 2,
    replicas,
    updatedReplicas: replicas,
    availableReplicas: replicas,
    readyReplicas: replicas,
  };
  return d;
}
const readyPodStatus = (pod) => {
  pod.status = { phase: "Running", conditions: [{ type: "Ready", status: "True" }] };
  return pod;
};
const container = (d, name) =>
  (d.spec.template?.spec ?? d.spec).containers.find((c) => c.name === name);

function newDeployment(
  name,
  namespace,
  { image = "nginx:1.27", containerName = "nginx", replicas = 1, resources } = {},
) {
  return rolledOut({
    apiVersion: "apps/v1",
    kind: "Deployment",
    metadata: { name, namespace, labels: { app: name } },
    spec: {
      replicas,
      selector: { matchLabels: { app: name } },
      template: {
        metadata: { labels: { app: name } },
        spec: { containers: [{ name: containerName, image, ...(resources ? { resources } : {}) }] },
      },
    },
  });
}

/** `edit(cluster, kind, name, ns, fn)`: mutate a stored object in place and store it again. */
function edit(cluster, kind, name, ns, fn) {
  const object = structuredClone(cluster.find(kind, name, ns));
  assert.ok(object, `${kind} ${ns}/${name} exists`);
  fn(object);
  cluster.put(object);
}

const SCENARIOS = {
  "k8s-0001": {
    solve(c) {
      c.put(
        readyPodStatus({
          apiVersion: "v1",
          kind: "Pod",
          metadata: { name: "web", namespace: "fl-k8s-0001" },
          spec: { containers: [{ name: "web", image: "nginx:1.27" }] },
        }),
      );
    },
    partial: {
      what: "a Ready Pod with the wrong image",
      run(c, self) {
        self.solve(c);
        edit(c, "Pod", "web", "fl-k8s-0001", (p) => (p.spec.containers[0].image = "nginx:latest"));
      },
      failing: ["image"],
    },
  },
  "k8s-0002": {
    solve(c) {
      const d = newDeployment("api", "fl-k8s-0002", { replicas: 2 });
      d.metadata.labels.tier = "backend";
      c.put(d);
    },
    partial: {
      what: "tier=backend on the Pod template instead of the Deployment",
      run(c) {
        const d = newDeployment("api", "fl-k8s-0002", { replicas: 2 });
        d.spec.template.metadata.labels.tier = "backend";
        c.put(d);
      },
      failing: ["label"],
    },
  },
  "k8s-0003": {
    solve(c) {
      c.put(newDeployment("catalog", "fl-k8s-0003", { replicas: 2 }));
      c.remove("Deployment", "catalog", "fl-k8s-0003-sandbox");
      edit(c, "Pod", "notes", "fl-k8s-0003-sandbox", readyPodStatus);
    },
    partial: {
      what: "right namespace, but the misplaced copy is left behind",
      run(c) {
        c.put(newDeployment("catalog", "fl-k8s-0003", { replicas: 2 }));
        edit(c, "Pod", "notes", "fl-k8s-0003-sandbox", readyPodStatus);
      },
      failing: ["removed"],
    },
  },
  "k8s-0004": {
    solve(c) {
      edit(c, "Deployment", "storefront", "fl-k8s-0004", (d) => {
        container(d, "web").image = "nginx:1.27";
        rolledOut(d);
      });
    },
    partial: {
      what: "image fixed, but the rollout has not finished",
      run(c) {
        edit(c, "Deployment", "storefront", "fl-k8s-0004", (d) => {
          container(d, "web").image = "nginx:1.27";
          rolledOut(d).status.updatedReplicas = 1;
        });
      },
      failing: ["rollout"],
    },
  },
  "k8s-0005": {
    solve(c) {
      edit(c, "Deployment", "status-page", "fl-k8s-0005", (d) => {
        container(d, "web").readinessProbe.httpGet.port = 80;
        rolledOut(d);
      });
    },
    partial: {
      what: "probe deleted, so the Pods look ready without proving anything",
      run(c) {
        edit(c, "Deployment", "status-page", "fl-k8s-0005", (d) => {
          delete container(d, "web").readinessProbe;
          rolledOut(d);
        });
      },
      failing: ["probe"],
    },
  },
  "k8s-0006": {
    solve(c) {
      edit(c, "Deployment", "ledger", "fl-k8s-0006", (d) => {
        container(d, "app").resources = {
          requests: { cpu: "100m", memory: "64Mi" },
          limits: { cpu: "250m", memory: "128Mi" },
        };
        rolledOut(d);
      });
    },
    partial: {
      what: "the same values also applied to the helper container",
      run(c) {
        edit(c, "Deployment", "ledger", "fl-k8s-0006", (d) => {
          for (const name of ["app", "metrics"])
            container(d, name).resources = {
              requests: { cpu: "100m", memory: "64Mi" },
              limits: { cpu: "250m", memory: "128Mi" },
            };
          rolledOut(d);
        });
      },
      failing: ["metrics-unchanged"],
    },
  },
  "k8s-0007": {
    solve(c) {
      edit(c, "Pod", "audit-log", "fl-k8s-0007", (p) => {
        p.spec.containers[0].env = [{ name: "LOG_LEVEL", value: "debug" }];
        readyPodStatus(p);
      });
    },
    partial: {
      what: "recreated with the new env but without the team label",
      run(c) {
        edit(c, "Pod", "audit-log", "fl-k8s-0007", (p) => {
          p.spec.containers[0].env = [{ name: "LOG_LEVEL", value: "debug" }];
          delete p.metadata.labels.team;
          readyPodStatus(p);
        });
      },
      failing: ["routed"],
    },
  },
  "k8s-0008": {
    solve(c) {
      edit(c, "Deployment", "gateway", "fl-k8s-0008", rolledOut);
    },
    partial: {
      what: "ConfigMap volume removed (nginx would start with its default site)",
      run(c) {
        edit(c, "Deployment", "gateway", "fl-k8s-0008", (d) => {
          delete container(d, "web").volumeMounts;
          delete d.spec.template.spec.volumes;
          rolledOut(d);
        });
      },
      failing: ["config"],
    },
  },
  "k8s-0009": {
    solve(c) {
      edit(c, "Service", "orders", "fl-k8s-0009", (s) => (s.spec.selector = { app: "orders" }));
      edit(c, "Deployment", "orders", "fl-k8s-0009", rolledOut);
      edit(c, "Deployment", "payments", "fl-k8s-0009", (d) => {
        container(d, "web").env[0].valueFrom.configMapKeyRef.name = "payments-config";
        rolledOut(d);
      });
    },
    partial: {
      what: "one workload fixed, the other still broken",
      run(c) {
        edit(c, "Service", "orders", "fl-k8s-0009", (s) => (s.spec.selector = { app: "orders" }));
        edit(c, "Deployment", "orders", "fl-k8s-0009", rolledOut);
      },
      failing: ["payments-env", "payments-available"],
    },
  },
  "k8s-0010": {
    solve(c) {
      edit(c, "Deployment", "inventory-api", "fl-k8s-0010", (d) => {
        container(d, "api").image = "nginx:1.27";
        container(d, "api").readinessProbe.httpGet.port = "http";
        d.spec.replicas = 3;
        rolledOut(d);
      });
      c.put(
        newDeployment("inventory-worker", "fl-k8s-0010", {
          containerName: "worker",
          resources: { requests: { cpu: "50m", memory: "32Mi" }, limits: { memory: "64Mi" } },
        }),
      );
      edit(c, "Deployment", "inventory-api", "fl-k8s-0010-legacy", (d) => {
        d.spec.replicas = 0;
        rolledOut(d);
      });
    },
    partial: {
      what: "everything done in the new namespace, but the change aimed at legacy hit the wrong one",
      run(c, self) {
        self.solve(c);
        edit(c, "Deployment", "inventory-api", "fl-k8s-0010-legacy", (d) => (d.spec.replicas = 1));
      },
      failing: ["legacy-scaled"],
    },
  },

  // ── Level 0 foundations (M5.1 revision) ──────────────────────────────────
  "k8s-0011": {
    solve(c) {
      for (const name of ["alpha", "bravo"]) edit(c, "Pod", name, "fl-k8s-0011", readyPodStatus);
      edit(c, "Pod", "bravo", "fl-k8s-0011", (p) => (p.metadata.labels.review = "needed"));
    },
    partial: {
      what: "labelled both Pods instead of finding the right one",
      run(c, self) {
        self.solve(c);
        edit(c, "Pod", "alpha", "fl-k8s-0011", (p) => (p.metadata.labels.review = "needed"));
      },
      failing: ["other-unlabelled"],
    },
  },
  "k8s-0012": {
    solve(c) {
      c.put(
        readyPodStatus({
          apiVersion: "v1",
          kind: "Pod",
          metadata: {
            name: "notes",
            namespace: "fl-k8s-0012",
            labels: { app: "notes", tier: "frontend" },
          },
          spec: { containers: [{ name: "web", image: "nginx:1.27" }] },
        }),
      );
    },
    partial: {
      what: "created with kubectl run: the container is named notes, one label missing",
      run(c) {
        c.put(
          readyPodStatus({
            apiVersion: "v1",
            kind: "Pod",
            metadata: { name: "notes", namespace: "fl-k8s-0012", labels: { app: "notes" } },
            spec: { containers: [{ name: "notes", image: "nginx:1.27" }] },
          }),
        );
      },
      failing: ["container", "labels"],
    },
  },
  "k8s-0013": {
    solve(c) {
      c.put(
        readyPodStatus({
          apiVersion: "v1",
          kind: "Pod",
          metadata: { name: "web", namespace: "fl-k8s-0013" },
          spec: { containers: [{ name: "web", image: "nginx:1.27" }] },
        }),
      );
      edit(c, "Pod", "web", "fl-k8s-0013-sandbox", readyPodStatus);
      c.remove("Pod", "scratch", "fl-k8s-0013-sandbox");
    },
    partial: {
      what: "deleted the sandbox's web instead of scratch",
      run(c, self) {
        self.solve(c);
        c.put({
          ...structuredClone(c.find("Pod", "web", "fl-k8s-0013")),
          metadata: { name: "scratch", namespace: "fl-k8s-0013-sandbox" },
        });
        c.remove("Pod", "web", "fl-k8s-0013-sandbox");
      },
      failing: ["sandbox-web-kept", "scratch-removed"],
    },
  },
  "k8s-0014": {
    solve(c) {
      for (const name of ["cart-a", "cart-b", "search-a"])
        edit(c, "Pod", name, "fl-k8s-0014", (p) => {
          p.metadata.labels.env = "prod";
          delete p.metadata.labels.debug;
          readyPodStatus(p);
        });
      c.put(
        readyPodStatus({
          apiVersion: "v1",
          kind: "Pod",
          metadata: {
            name: "cart-c",
            namespace: "fl-k8s-0014",
            labels: { app: "cart", env: "prod" },
          },
          spec: { containers: [{ name: "cart-c", image: "nginx:1.27" }] },
        }),
      );
    },
    partial: {
      what: "env promoted everywhere, but the debug label left on search-a",
      run(c, self) {
        self.solve(c);
        edit(c, "Pod", "search-a", "fl-k8s-0014", (p) => (p.metadata.labels.debug = "true"));
      },
      failing: ["search-debug-removed"],
    },
  },
  "k8s-0015": {
    solve(c) {
      edit(c, "Deployment", "frontend", "fl-k8s-0015", (d) =>
        rolledOut(Object.assign(d, { spec: { ...d.spec, replicas: 3 } })),
      );
      edit(c, "Deployment", "worker", "fl-k8s-0015", (d) =>
        rolledOut(Object.assign(d, { spec: { ...d.spec, replicas: 1 } })),
      );
    },
    partial: {
      what: "only the frontend scaled",
      run(c) {
        edit(c, "Deployment", "frontend", "fl-k8s-0015", (d) =>
          rolledOut(Object.assign(d, { spec: { ...d.spec, replicas: 3 } })),
        );
        edit(c, "Deployment", "worker", "fl-k8s-0015", rolledOut);
      },
      failing: ["worker-available", "worker-desired"],
    },
  },
  "k8s-0016": {
    solve(c) {
      edit(c, "Deployment", "reports", "fl-k8s-0016", (d) => {
        d.spec.replicas = 2;
        d.metadata.labels.team = "analytics";
        rolledOut(d);
      });
    },
    partial: {
      what: "team label put on the Pod template instead of the Deployment",
      run(c) {
        edit(c, "Deployment", "reports", "fl-k8s-0016", (d) => {
          d.spec.replicas = 2;
          d.spec.template.metadata.labels.team = "analytics";
          rolledOut(d);
        });
      },
      failing: ["labels"],
    },
  },
  "k8s-0017": {
    solve(c) {
      edit(c, "Deployment", "greeter", "fl-k8s-0017", (d) => {
        d.spec.replicas = 2;
        d.metadata.labels.app = "greeter";
        rolledOut(d);
      });
      c.put(
        readyPodStatus({
          apiVersion: "v1",
          kind: "Pod",
          metadata: { name: "greeter-check", namespace: "fl-k8s-0017" },
          spec: { containers: [{ name: "greeter-check", image: "nginx:1.27" }] },
        }),
      );
      c.remove("Pod", "greeter-check", "fl-k8s-0017-sandbox");
    },
    partial: {
      what: "two of three slips fixed: the label typo is still there",
      run(c, self) {
        self.solve(c);
        edit(c, "Deployment", "greeter", "fl-k8s-0017", (d) => (d.metadata.labels.app = "greter"));
      },
      failing: ["label"],
    },
  },
  "k8s-0018": {
    solve(c) {
      edit(c, "Deployment", "shop", "fl-k8s-0018", (d) => {
        d.spec.replicas = 3;
        d.metadata.labels.env = "prod";
        rolledOut(d);
      });
      for (const name of ["batch-1", "batch-2"])
        edit(c, "Pod", name, "fl-k8s-0018", readyPodStatus);
      edit(c, "Pod", "batch-2", "fl-k8s-0018", (p) => (p.metadata.labels.team = "payments"));
      c.put(
        readyPodStatus({
          apiVersion: "v1",
          kind: "Pod",
          metadata: { name: "status", namespace: "fl-k8s-0018-tools", labels: { app: "status" } },
          spec: { containers: [{ name: "probe", image: "nginx:1.27" }] },
        }),
      );
    },
    partial: {
      what: "the right batch Pod guessed wrong, and the status Pod in the shop namespace",
      run(c, self) {
        self.solve(c);
        edit(c, "Pod", "batch-2", "fl-k8s-0018", (p) => delete p.metadata.labels.team);
        edit(c, "Pod", "batch-1", "fl-k8s-0018", (p) => (p.metadata.labels.team = "payments"));
        const status = structuredClone(c.find("Pod", "status", "fl-k8s-0018-tools"));
        c.remove("Pod", "status", "fl-k8s-0018-tools");
        status.metadata.namespace = "fl-k8s-0018";
        c.put(status);
      },
      failing: [
        "batch-labelled",
        "batch-other-unlabelled",
        "status-container",
        "status-label",
        "status-placed",
        "status-ready",
      ],
    },
  },

  // ── Level 1: Deployment Lifecycle & Rollout Fluency (M5.3) ─────────────────
  // k8s-0030, k8s-0031, k8s-0034 excluded: setup.steps incompatible with fake cluster
  // (partial manifest shallow-merge loses spec.replicas; waitRollout unsupported)

  "k8s-0019": {
    solve(c) {
      edit(c, "Deployment", "catalog", "fl-k8s-0019", (d) => {
        d.spec.template.metadata.labels.tier = "backend";
        rolledOut(d);
      });
    },
    partial: {
      what: "tier=backend added to Deployment's own labels instead of pod template",
      run(c) {
        edit(c, "Deployment", "catalog", "fl-k8s-0019", (d) => {
          d.metadata.labels.tier = "backend";
          rolledOut(d);
        });
      },
      failing: ["tier-label"],
    },
  },
  "k8s-0020": {
    solve(c) {
      edit(c, "Deployment", "frontend", "fl-k8s-0020", (d) => {
        d.spec.template.metadata.labels.env = "staging";
        rolledOut(d);
      });
    },
    partial: {
      what: "env=staging added to Deployment's own labels instead of pod template",
      run(c) {
        edit(c, "Deployment", "frontend", "fl-k8s-0020", (d) => {
          d.metadata.labels.env = "staging";
          rolledOut(d);
        });
      },
      failing: ["env-label"],
    },
  },
  "k8s-0021": {
    solve(c) {
      edit(c, "Deployment", "orders", "fl-k8s-0021", (d) => {
        d.spec.replicas = 4;
        d.metadata.annotations = {
          ...d.metadata.annotations,
          "featherlab.dev/scale-reason": "high-availability",
        };
        rolledOut(d);
      });
    },
    partial: {
      what: "scaled to 4 but annotation not added",
      run(c) {
        edit(c, "Deployment", "orders", "fl-k8s-0021", (d) => {
          d.spec.replicas = 4;
          rolledOut(d);
        });
      },
      failing: ["scale-annotation"],
    },
  },
  "k8s-0022": {
    solve(c) {
      c.put(
        rolledOut({
          apiVersion: "apps/v1",
          kind: "Deployment",
          metadata: { name: "api-server", namespace: "fl-k8s-0022", labels: { app: "api-server" } },
          spec: {
            replicas: 2,
            selector: { matchLabels: { app: "api-server" } },
            template: {
              metadata: { labels: { app: "api-server", version: "v1" } },
              spec: { containers: [{ name: "api", image: "nginx:1.27" }] },
            },
          },
        }),
      );
    },
    partial: {
      what: "Deployment created but container named nginx (default) instead of api",
      run(c) {
        c.put(
          rolledOut({
            apiVersion: "apps/v1",
            kind: "Deployment",
            metadata: {
              name: "api-server",
              namespace: "fl-k8s-0022",
              labels: { app: "api-server" },
            },
            spec: {
              replicas: 2,
              selector: { matchLabels: { app: "api-server" } },
              template: {
                metadata: { labels: { app: "api-server", version: "v1" } },
                spec: { containers: [{ name: "nginx", image: "nginx:1.27" }] },
              },
            },
          }),
        );
      },
      failing: ["image"],
    },
  },
  "k8s-0023": {
    solve(c) {
      edit(c, "Deployment", "storefront", "fl-k8s-0023", (d) => {
        container(d, "web").image = "nginx:1.27-alpine";
        rolledOut(d);
      });
    },
    partial: {
      what: "image updated but rollout not complete",
      run(c) {
        edit(c, "Deployment", "storefront", "fl-k8s-0023", (d) => {
          container(d, "web").image = "nginx:1.27-alpine";
          rolledOut(d).status.updatedReplicas = 1;
        });
      },
      failing: ["rollout"],
    },
  },
  "k8s-0024": {
    solve(c) {
      edit(c, "Deployment", "payment-api", "fl-k8s-0024", (d) => {
        container(d, "app").image = "nginx:1.27-alpine";
        rolledOut(d);
      });
    },
    partial: {
      what: "image updated but rollout not complete",
      run(c) {
        edit(c, "Deployment", "payment-api", "fl-k8s-0024", (d) => {
          container(d, "app").image = "nginx:1.27-alpine";
          rolledOut(d).status.updatedReplicas = 2;
        });
      },
      failing: ["rollout"],
    },
  },
  "k8s-0025": {
    solve(c) {
      edit(c, "Deployment", "notification-svc", "fl-k8s-0025", (d) => {
        container(d, "web").image = "nginx:1.27-alpine";
        rolledOut(d);
      });
    },
    partial: {
      what: "image updated but rollout not complete",
      run(c) {
        edit(c, "Deployment", "notification-svc", "fl-k8s-0025", (d) => {
          container(d, "web").image = "nginx:1.27-alpine";
          rolledOut(d).status.updatedReplicas = 1;
        });
      },
      failing: ["rollout"],
    },
  },
  "k8s-0026": {
    solve(c) {
      edit(c, "Deployment", "billing", "fl-k8s-0026", (d) => {
        d.spec.strategy = {
          type: "RollingUpdate",
          rollingUpdate: { maxSurge: 1, maxUnavailable: 0 },
        };
        rolledOut(d);
      });
    },
    partial: {
      what: "strategy changed to RollingUpdate but wrong maxUnavailable (1 instead of 0)",
      run(c) {
        edit(c, "Deployment", "billing", "fl-k8s-0026", (d) => {
          d.spec.strategy = {
            type: "RollingUpdate",
            rollingUpdate: { maxSurge: 1, maxUnavailable: 1 },
          };
          rolledOut(d);
        });
      },
      failing: ["strategy"],
    },
  },
  "k8s-0027": {
    solve(c) {
      edit(c, "Deployment", "inventory", "fl-k8s-0027", (d) => {
        d.spec.strategy = {
          type: "RollingUpdate",
          rollingUpdate: { maxSurge: 1, maxUnavailable: 1 },
        };
        rolledOut(d);
      });
    },
    partial: {
      what: "maxSurge correct but maxUnavailable wrong (0 instead of 1)",
      run(c) {
        edit(c, "Deployment", "inventory", "fl-k8s-0027", (d) => {
          d.spec.strategy = {
            type: "RollingUpdate",
            rollingUpdate: { maxSurge: 1, maxUnavailable: 0 },
          };
          rolledOut(d);
        });
      },
      failing: ["strategy"],
    },
  },
  "k8s-0028": {
    solve(c) {
      edit(c, "Deployment", "reports", "fl-k8s-0028", (d) => {
        container(d, "app").image = "nginx:1.27-alpine";
        d.metadata.annotations = {
          ...d.metadata.annotations,
          "kubernetes.io/change-cause": "upgrade to nginx 1.27-alpine",
        };
        rolledOut(d);
      });
    },
    partial: {
      what: "image updated but change-cause annotation has wrong value",
      run(c) {
        edit(c, "Deployment", "reports", "fl-k8s-0028", (d) => {
          container(d, "app").image = "nginx:1.27-alpine";
          d.metadata.annotations = {
            ...d.metadata.annotations,
            "kubernetes.io/change-cause": "upgrade nginx",
          };
          rolledOut(d);
        });
      },
      failing: ["change-cause"],
    },
  },
  "k8s-0029": {
    solve(c) {
      edit(c, "Deployment", "search", "fl-k8s-0029", (d) => {
        delete d.spec.paused;
        container(d, "app").image = "nginx:1.27-alpine";
        d.spec.replicas = 3;
        rolledOut(d);
      });
    },
    partial: {
      what: "deployment resumed and scaled but image not updated",
      run(c) {
        edit(c, "Deployment", "search", "fl-k8s-0029", (d) => {
          delete d.spec.paused;
          d.spec.replicas = 3;
          rolledOut(d);
        });
      },
      failing: ["image"],
    },
  },
  "k8s-0032": {
    solve(c) {
      edit(c, "Deployment", "auth", "fl-k8s-0032", (d) => {
        container(d, "server").image = "nginx:1.27";
        rolledOut(d);
      });
    },
    partial: {
      what: "image fixed but rollout not complete",
      run(c) {
        edit(c, "Deployment", "auth", "fl-k8s-0032", (d) => {
          container(d, "server").image = "nginx:1.27";
          rolledOut(d).status.updatedReplicas = 1;
        });
      },
      failing: ["rollout"],
    },
  },
  "k8s-0033": {
    solve(c) {
      c.put(
        rolledOut({
          apiVersion: "apps/v1",
          kind: "Deployment",
          metadata: {
            name: "legacy-worker",
            namespace: "fl-k8s-0033",
            labels: { app: "legacy-worker" },
          },
          spec: {
            replicas: 1,
            selector: { matchLabels: { app: "legacy-worker" } },
            template: {
              metadata: { labels: { app: "legacy-worker" } },
              spec: { containers: [{ name: "worker", image: "nginx:1.27" }] },
            },
          },
        }),
      );
    },
    partial: {
      what: "Deployment created with wrong container name (app instead of worker)",
      run(c) {
        c.put(
          rolledOut({
            apiVersion: "apps/v1",
            kind: "Deployment",
            metadata: {
              name: "legacy-worker",
              namespace: "fl-k8s-0033",
              labels: { app: "legacy-worker" },
            },
            spec: {
              replicas: 1,
              selector: { matchLabels: { app: "legacy-worker" } },
              template: {
                metadata: { labels: { app: "legacy-worker" } },
                spec: { containers: [{ name: "app", image: "nginx:1.27" }] },
              },
            },
          }),
        );
      },
      failing: ["image"],
    },
  },
};

const failing = (result) =>
  result.checks
    .filter((c) => !c.passed)
    .map((c) => c.id)
    .sort();

for (const [id, scenario] of Object.entries(SCENARIOS)) {
  test(`${id}: fresh baseline fails, a solution passes, a partial solution fails, a revisit is fresh`, async () => {
    const cluster = createFakeCluster();
    const { service } = createApp({ runner: cluster, logger: quiet });
    const confirmed = { discardActive: true };

    // Fresh activation; the baseline guard already required `failed`. Check it explicitly.
    assert.equal((await service.activate(id, confirmed)).environment, "fresh");
    const baseline = await service.check(id);
    assert.equal(baseline.outcome, "failed", JSON.stringify(baseline.checks));

    scenario.solve(cluster);
    const solved = await service.check(id);
    assert.equal(solved.outcome, "passed", JSON.stringify(solved.checks.filter((c) => !c.passed)));

    await service.reset(id);
    scenario.partial.run(cluster, scenario);
    const partial = await service.check(id);
    assert.equal(partial.outcome, "failed", scenario.partial.what);
    assert.deepEqual(failing(partial), [...scenario.partial.failing].sort(), scenario.partial.what);
    assert.ok(
      partial.checks.filter((c) => !c.passed).every((c) => c.feedback.length > 0),
      "every failing check explains what it saw",
    );

    // Switching away and back starts unsolved again.
    await service.reset(id);
    scenario.solve(cluster);
    assert.equal((await service.check(id)).outcome, "passed");
    const other = id === "k8s-0001" ? "k8s-0002" : "k8s-0001";
    await service.activate(other, confirmed);
    assert.ok(
      cluster
        .all()
        .every((r) => !String(r.metadata.namespace ?? r.metadata.name).startsWith(`fl-${id}`)),
      "nothing of the exercise survives a switch",
    );
    await service.activate(id, confirmed);
    assert.equal((await service.check(id)).outcome, "failed", "a revisit must be solved again");
  });
}
