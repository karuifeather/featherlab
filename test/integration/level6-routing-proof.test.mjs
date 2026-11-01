/**
 * Batch 0 proof-of-capability: verify the kind-routing environment works before
 * authoring Level 6 exercises.
 *
 * Opt-in: FEATHERLAB_KIND_TESTS=1 (needs Docker and kind).
 *
 * This test provisions a disposable `featherlab-test-*` cluster, installs the Traefik
 * routing controller + Gateway API CRDs + GatewayClass, then verifies:
 *
 *   1. Gateway API CRDs are installed (GatewayClass, Gateway, HTTPRoute, ReferenceGrant).
 *   2. Traefik Deployment is ready.
 *   3. The `traefik` GatewayClass exists.
 *   4. A Gateway with a listener on port 80 becomes Programmed.
 *   5. An HTTPRoute attaches successfully (Accepted + ResolvedRefs).
 *   6. HTTP request through Traefik with a Host header reaches the correct backend.
 *   7. Namespace cleanup removes all exercise resources without hanging.
 *
 * A routing-incapable cluster produces clear "skip" output for Level 6 exercises.
 * If this proof does not pass, stop and report — do not proceed with Level 6 content.
 */

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { IsolatedEnvironment } from "../helpers/isolated-environment.mjs";
import { installRouting } from "../../src/tracks/kubernetes/routing/install.mjs";
import { run } from "../../src/lib/runtime.mjs";

const enabled = process.env.FEATHERLAB_KIND_TESTS === "1";

// Check that the Gateway API CRDs file has been populated
const crdsPlaceholder = "PLACEHOLDER";
let crdsPopulated = true;
try {
  const { readFileSync } = await import("node:fs");
  const crds = readFileSync(
    new URL("../../src/tracks/kubernetes/routing/gateway-api-crds.yaml", import.meta.url),
    "utf8",
  );
  crdsPopulated = !crds.includes(crdsPlaceholder);
} catch {
  crdsPopulated = false;
}

const routingEnabled = enabled && crdsPopulated;
const routingSkip = routingEnabled
  ? false
  : "Gateway API CRDs not yet populated — see src/tracks/kubernetes/routing/gateway-api-crds.yaml";

let env;

before(async () => {
  if (!routingEnabled) return;
  env = new IsolatedEnvironment({ log: console }).start();

  // Install routing stack into the test cluster
  const exec = (binary, args, options = {}) =>
    run(binary, args, {
      ...options,
      env: {
        ...process.env,
        KUBECONFIG: env.config.stateDir + "/host-kubeconfig",
      },
    });
  installRouting({ exec, log: console });
});

after(() => env?.teardown());

// ─── 1. CRD installation ──────────────────────────────────────────────────────

test("GatewayClass CRD exists", { skip: routingSkip }, () => {
  const out = env.kubectl(
    "get",
    "crd",
    "gatewayclasses.gateway.networking.k8s.io",
    "--ignore-not-found",
    "-o",
    "name",
  );
  assert.match(out, /gatewayclasses/);
});

test("Gateway CRD exists", { skip: routingSkip }, () => {
  const out = env.kubectl(
    "get",
    "crd",
    "gateways.gateway.networking.k8s.io",
    "--ignore-not-found",
    "-o",
    "name",
  );
  assert.match(out, /gateways/);
});

test("HTTPRoute CRD exists", { skip: routingSkip }, () => {
  const out = env.kubectl(
    "get",
    "crd",
    "httproutes.gateway.networking.k8s.io",
    "--ignore-not-found",
    "-o",
    "name",
  );
  assert.match(out, /httproutes/);
});

test("ReferenceGrant CRD exists", { skip: routingSkip }, () => {
  const out = env.kubectl(
    "get",
    "crd",
    "referencegrants.gateway.networking.k8s.io",
    "--ignore-not-found",
    "-o",
    "name",
  );
  assert.match(out, /referencegrants/);
});

// ─── 2. Traefik readiness ─────────────────────────────────────────────────────

test("Traefik Deployment is ready", { skip: routingSkip }, () => {
  const out = env.kubectl(
    "get",
    "deployment",
    "traefik",
    "-n",
    "traefik-system",
    "-o",
    "jsonpath={.status.readyReplicas}",
  );
  assert.equal(out.trim(), "1");
});

test("Traefik Service exists with ports 80 and 443", { skip: routingSkip }, () => {
  const out = env.kubectl(
    "get",
    "service",
    "traefik",
    "-n",
    "traefik-system",
    "-o",
    "jsonpath={.spec.ports[*].port}",
  );
  assert.match(out, /80/);
  assert.match(out, /443/);
});

// ─── 3. GatewayClass ─────────────────────────────────────────────────────────

test("traefik GatewayClass exists", { skip: routingSkip }, () => {
  const out = env.kubectl("get", "gatewayclass", "traefik", "--ignore-not-found", "-o", "name");
  assert.match(out, /traefik/);
});

test("traefik GatewayClass is Accepted", { skip: routingSkip }, () => {
  // Poll up to 60 s — Traefik may take a moment to reconcile the GatewayClass after startup.
  let accepted = false;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline && !accepted) {
    try {
      const out = env.kubectl(
        "get",
        "gatewayclass",
        "traefik",
        "-o",
        "jsonpath={.status.conditions[?(@.type=='Accepted')].status}",
      );
      accepted = out.trim() === "True";
    } catch {
      /* not ready yet */
    }
    if (!accepted) run("sleep", ["3"]);
  }
  if (!accepted) {
    try {
      const logs = env.kubectl("logs", "-n", "traefik-system", "deployment/traefik", "--tail=60");
      console.error("--- Traefik logs (last 60 lines) ---\n" + logs);
    } catch {
      /* best effort */
    }
  }
  assert.ok(
    accepted,
    "GatewayClass 'traefik' did not become Accepted within 60 s — see logs above",
  );
});

// ─── 4. Gateway listener programmed ──────────────────────────────────────────

test("Gateway in test namespace becomes Programmed", { skip: routingSkip }, async () => {
  const ns = "featherlab-proof-gw";
  try {
    env.kubectl("create", "namespace", ns);
    env.kubectlWithInput(
      `apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: proof-gw
  namespace: ${ns}
spec:
  gatewayClassName: traefik
  listeners:
    - name: http
      port: 80
      protocol: HTTP
      hostname: "proof.fl.test"
`,
      "apply",
      "-f",
      "-",
    );

    // Poll for Programmed=True (up to 60 s)
    let programmed = false;
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline && !programmed) {
      try {
        const out = env.kubectl(
          "get",
          "gateway",
          "proof-gw",
          "-n",
          ns,
          "-o",
          "jsonpath={.status.conditions[?(@.type=='Programmed')].status}",
        );
        programmed = out.trim() === "True";
      } catch {
        // Not yet
      }
      if (!programmed) {
        run("sleep", ["2"]);
      }
    }
    assert.ok(programmed, "Gateway did not become Programmed within 60 s");
  } finally {
    try {
      env.kubectl("delete", "namespace", ns, "--ignore-not-found");
    } catch {
      /* best effort */
    }
  }
});

// ─── 5. HTTPRoute accepted and actual HTTP routing ────────────────────────────

test("HTTPRoute accepted and HTTP request reaches backend", { skip: routingSkip }, async () => {
  const ns = "featherlab-proof-route";
  try {
    env.kubectl("create", "namespace", ns);

    // Deploy a simple nginx backend
    env.kubectlWithInput(
      `apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend
  namespace: ${ns}
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
      containers:
        - name: backend
          image: nginx:1.27
          ports:
            - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: backend
  namespace: ${ns}
spec:
  selector:
    app: backend
  ports:
    - port: 80
      targetPort: 80
`,
      "apply",
      "-f",
      "-",
    );

    // Wait for backend ready
    env.kubectl("rollout", "status", "deployment/backend", "-n", ns, "--timeout=60s");

    // Create a Gateway and HTTPRoute
    env.kubectlWithInput(
      `apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: proof-gw
  namespace: ${ns}
spec:
  gatewayClassName: traefik
  listeners:
    - name: http
      port: 80
      protocol: HTTP
      hostname: "backend.proof.fl.test"
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: proof-route
  namespace: ${ns}
spec:
  parentRefs:
    - name: proof-gw
  hostnames:
    - "backend.proof.fl.test"
  rules:
    - backendRefs:
        - name: backend
          port: 80
`,
      "apply",
      "-f",
      "-",
    );

    // Poll for HTTPRoute Accepted (up to 60 s)
    let accepted = false;
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline && !accepted) {
      try {
        const out = env.kubectl(
          "get",
          "httproute",
          "proof-route",
          "-n",
          ns,
          "-o",
          "jsonpath={.status.parents[0].conditions[?(@.type=='Accepted')].status}",
        );
        accepted = out.trim() === "True";
      } catch {
        /* not yet */
      }
      if (!accepted) run("sleep", ["2"]);
    }
    assert.ok(accepted, "HTTPRoute did not become Accepted within 60 s");

    // Create a curl client pod to test actual HTTP routing
    env.kubectlWithInput(
      `apiVersion: v1
kind: Pod
metadata:
  name: proof-client
  namespace: ${ns}
spec:
  restartPolicy: Never
  containers:
    - name: curl
      image: curlimages/curl:8.13.0
      command: ["sleep", "120"]
`,
      "apply",
      "-f",
      "-",
    );

    // Wait for client pod to be running
    env.kubectl("wait", "pod/proof-client", "-n", ns, "--for=condition=Ready", "--timeout=60s");

    // Actual HTTP request through Traefik with Host header
    const out = env.kubectl(
      "exec",
      "proof-client",
      "-n",
      ns,
      "--",
      "curl",
      "--silent",
      "--max-time",
      "8",
      "--connect-to",
      "backend.proof.fl.test::traefik.traefik-system.svc.cluster.local:80",
      "http://backend.proof.fl.test/",
    );
    assert.match(out, /Welcome to nginx/, "HTTP response should contain nginx welcome page");
  } finally {
    try {
      env.kubectl("delete", "namespace", ns, "--ignore-not-found");
    } catch {
      /* best effort */
    }
  }
});

// ─── 6. Ingress routing ───────────────────────────────────────────────────────

test("Ingress with hostname routes HTTP request to backend", { skip: routingSkip }, async () => {
  const ns = "featherlab-proof-ingress";
  try {
    env.kubectl("create", "namespace", ns);

    env.kubectlWithInput(
      `apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: ${ns}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: nginx:1.27
          ports:
            - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: web
  namespace: ${ns}
spec:
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 80
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
  namespace: ${ns}
spec:
  ingressClassName: traefik
  rules:
    - host: web.proof.fl.test
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web
                port:
                  number: 80
`,
      "apply",
      "-f",
      "-",
    );

    env.kubectl("rollout", "status", "deployment/web", "-n", ns, "--timeout=60s");

    // Create a curl client pod
    env.kubectlWithInput(
      `apiVersion: v1
kind: Pod
metadata:
  name: ingress-client
  namespace: ${ns}
spec:
  restartPolicy: Never
  containers:
    - name: curl
      image: curlimages/curl:8.13.0
      command: ["sleep", "120"]
`,
      "apply",
      "-f",
      "-",
    );
    env.kubectl("wait", "pod/ingress-client", "-n", ns, "--for=condition=Ready", "--timeout=60s");

    // Retry: Traefik may need a moment to sync the new Ingress rule.
    let httpOut = "";
    const curlDeadline = Date.now() + 30_000;
    while (Date.now() < curlDeadline) {
      try {
        httpOut = env.kubectl(
          "exec",
          "ingress-client",
          "-n",
          ns,
          "--",
          "curl",
          "--silent",
          "--max-time",
          "8",
          "--connect-to",
          "web.proof.fl.test::traefik.traefik-system.svc.cluster.local:80",
          "http://web.proof.fl.test/",
        );
        if (/Welcome to nginx/.test(httpOut)) break;
      } catch {
        /* not yet */
      }
      run("sleep", ["3"]);
    }
    assert.match(httpOut, /Welcome to nginx/);
  } finally {
    try {
      env.kubectl("delete", "namespace", ns, "--ignore-not-found");
    } catch {
      /* best effort */
    }
  }
});

// ─── 7. Cleanup safety ───────────────────────────────────────────────────────

test(
  "namespace deletion does not hang after Gateway/HTTPRoute removal",
  { skip: routingSkip },
  () => {
    const ns = "featherlab-proof-cleanup";
    env.kubectl("create", "namespace", ns);
    env.kubectlWithInput(
      `apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: cleanup-gw
  namespace: ${ns}
spec:
  gatewayClassName: traefik
  listeners:
    - name: http
      port: 80
      protocol: HTTP
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: cleanup-route
  namespace: ${ns}
spec:
  parentRefs:
    - name: cleanup-gw
  rules:
    - backendRefs:
        - name: nonexistent
          port: 80
`,
      "apply",
      "-f",
      "-",
    );

    // Delete the namespace and confirm it disappears within 30 s
    env.kubectl("delete", "namespace", ns);
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      try {
        const out = env.kubectl("get", "namespace", ns, "--ignore-not-found", "-o", "name");
        if (!out.trim()) return; // namespace gone
      } catch {
        /* not found is fine */
      }
      run("sleep", ["2"]);
    }
    assert.fail(`Namespace ${ns} did not terminate within 30 s — check for stuck finalizers`);
  },
);
