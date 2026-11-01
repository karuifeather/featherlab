/**
 * Level 7 proof-of-capability: verify that the kind cluster's default kindnet CNI actually
 * enforces NetworkPolicy before authoring exercises that depend on it.
 *
 * Opt-in: FEATHERLAB_KIND_TESTS=1 (needs Docker and kind).
 *
 * This test provisions a disposable `featherlab-test-*` cluster and verifies:
 *
 *   1. kindnet DaemonSet is ready.
 *   2. Baseline Pod→Pod HTTP traffic works without any policy.
 *   3. A default-deny ingress NetworkPolicy blocks both clients.
 *   4. An allow rule restores access for the authorized client only.
 *   5. An unauthorized client remains blocked after the allow rule.
 *   6. A default-deny egress policy blocks outbound connections (DNS blocked).
 *   7. Restoring DNS and server egress allows connectivity again.
 *   8. Namespace cleanup completes without hanging.
 *
 * **FAIL CLOSED**: if enforcement cannot be demonstrated, this test FAILS.
 * With FEATHERLAB_KIND_TESTS=1 set, a skip would silently hide a broken enforcement
 * environment. Level 7 exercises MUST NOT run on a non-enforcing cluster.
 *
 * Verified: kind v0.33.0, kindest/node:v1.37.0, 2026-11-01.
 *
 * Known deny signatures (documented in src/tracks/kubernetes/networkpolicy/README.md):
 *   Ingress block  → curl exit 28 (timeout — TCP silently dropped)
 *   Egress block   → curl exit 6  (can't resolve host — DNS blocked too)
 *   Port refused   → curl exit 7  (connection refused)
 */

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { IsolatedEnvironment } from "../helpers/isolated-environment.mjs";

const enabled = process.env.FEATHERLAB_KIND_TESTS === "1";
const options = {
  skip: enabled ? false : "set FEATHERLAB_KIND_TESTS=1 (needs Docker and kind)",
};

let env;

before(async () => {
  if (!enabled) return;
  env = new IsolatedEnvironment({ log: console }).start();
});

after(() => env?.teardown());

const NS = "netpol-proof";

/**
 * Attempt an HTTP request from a named Pod via kubectl exec + curl.
 * Returns true if curl exits 0 AND the server returns HTTP 200.
 * Returns false if curl throws (non-zero exit: timeout, DNS fail, refused).
 */
function canReach(pod, url) {
  try {
    const out = env.kubectl(
      "exec",
      pod,
      "-n",
      NS,
      "--",
      "curl",
      "-s",
      "-o",
      "/dev/null",
      "-w",
      "%{http_code}",
      "--max-time",
      "8",
      url,
    );
    return out.trim() === "200";
  } catch {
    return false;
  }
}

function applyPolicy(yaml) {
  env.kubectlWithInput(yaml, "apply", "-f", "-");
}

/** Wait `ms` milliseconds synchronously (host-side, no exec). */
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// ─── 1. CNI readiness ─────────────────────────────────────────────────────────

test("kindnet DaemonSet is ready", options, () => {
  const out = env.kubectl(
    "get",
    "daemonset",
    "kindnet",
    "-n",
    "kube-system",
    "-o",
    "jsonpath={.status.numberReady}/{.status.desiredNumberScheduled}",
  );
  const [ready, desired] = out.trim().split("/").map(Number);
  assert.ok(ready >= 1, `kindnet numberReady=${ready}`);
  assert.equal(ready, desired, `kindnet not fully ready: ${out}`);
});

// ─── 2. Workload setup ────────────────────────────────────────────────────────

test("setup: namespace and workloads", options, () => {
  env.kubectl("create", "namespace", NS);

  // Server: nginx
  env.kubectl("run", "server", "--image=nginx:1.27", "-n", NS, "--port=80");
  env.kubectl("wait", "--for=condition=Ready", "pod/server", "-n", NS, "--timeout=90s");
  env.kubectl("expose", "pod", "server", "--port=80", "-n", NS);

  // Authorized client Pod (label run=client-a)
  env.kubectl(
    "run",
    "client-a",
    "--image=curlimages/curl:8.10.1",
    "-n",
    NS,
    "--restart=Never",
    "--",
    "sh",
    "-c",
    "sleep 600",
  );
  env.kubectl("wait", "--for=condition=Ready", "pod/client-a", "-n", NS, "--timeout=90s");

  // Unauthorized client Pod (label run=client-b)
  env.kubectl(
    "run",
    "client-b",
    "--image=curlimages/curl:8.10.1",
    "-n",
    NS,
    "--restart=Never",
    "--",
    "sh",
    "-c",
    "sleep 600",
  );
  env.kubectl("wait", "--for=condition=Ready", "pod/client-b", "-n", NS, "--timeout=90s");
});

// ─── 3. Baseline ─────────────────────────────────────────────────────────────

test("baseline: client-a reaches server without any policy (HTTP 200)", options, () => {
  assert.ok(
    canReach("client-a", `http://server.${NS}.svc.cluster.local/`),
    "client-a should reach server with no NetworkPolicy applied",
  );
});

test("baseline: client-b also reaches server without any policy (HTTP 200)", options, () => {
  assert.ok(
    canReach("client-b", `http://server.${NS}.svc.cluster.local/`),
    "client-b should reach server with no NetworkPolicy applied",
  );
});

// ─── 4. Default-deny ingress ──────────────────────────────────────────────────

test("default-deny ingress blocks both clients", options, () => {
  applyPolicy(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-ingress
  namespace: ${NS}
spec:
  podSelector: {}
  policyTypes:
  - Ingress
`);
  sleep(5000); // let kindnet converge the iptables rules

  assert.ok(
    !canReach("client-a", `http://server.${NS}.svc.cluster.local/`),
    "client-a should be blocked after default-deny ingress",
  );
  assert.ok(
    !canReach("client-b", `http://server.${NS}.svc.cluster.local/`),
    "client-b should be blocked after default-deny ingress",
  );
});

// ─── 5. Allow rule for specific client ────────────────────────────────────────

test("allow rule for client-a restores access; client-b remains blocked", options, () => {
  applyPolicy(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-client-a
  namespace: ${NS}
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          run: client-a
`);
  sleep(5000);

  assert.ok(
    canReach("client-a", `http://server.${NS}.svc.cluster.local/`),
    "client-a should be allowed after allow rule",
  );
  assert.ok(
    !canReach("client-b", `http://server.${NS}.svc.cluster.local/`),
    "client-b should still be blocked after allow-client-a rule",
  );
});

// ─── 6. Default-deny egress ───────────────────────────────────────────────────

test("default-deny egress on client-a blocks outbound (DNS + TCP)", options, () => {
  // Apply egress deny ONLY for client-a; also remove the ingress policies to simplify state.
  env.kubectl("delete", "networkpolicy", "default-deny-ingress", "allow-client-a", "-n", NS);
  applyPolicy(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-egress-client-a
  namespace: ${NS}
spec:
  podSelector:
    matchLabels:
      run: client-a
  policyTypes:
  - Egress
`);
  sleep(5000);

  // DNS egress is also blocked — curl exits with code 6 (can't resolve host).
  // The k8s.traffic-blocked validator accepts exit 6, 7, and 28 as blocked.
  assert.ok(
    !canReach("client-a", `http://server.${NS}.svc.cluster.local/`),
    "client-a should be blocked by default-deny egress (DNS + TCP both blocked)",
  );

  // client-b has no egress policy; it should still reach the server.
  assert.ok(
    canReach("client-b", `http://server.${NS}.svc.cluster.local/`),
    "client-b has no egress policy — should still reach server",
  );
});

// ─── 7. Egress allow restores connectivity ────────────────────────────────────

test("restoring DNS + server egress allows client-a to reach server again", options, () => {
  // Discover kube-dns IP at runtime to build a portable egress allow rule.
  const dnsIP = env
    .kubectl("get", "svc", "kube-dns", "-n", "kube-system", "-o", "jsonpath={.spec.clusterIP}")
    .trim();
  assert.ok(dnsIP, "kube-dns Service IP must be discoverable");

  applyPolicy(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-egress-client-a
  namespace: ${NS}
spec:
  podSelector:
    matchLabels:
      run: client-a
  policyTypes:
  - Egress
  egress:
  - to:
    - ipBlock:
        cidr: ${dnsIP}/32
    ports:
    - protocol: UDP
      port: 53
    - protocol: TCP
      port: 53
  - to:
    - podSelector:
        matchLabels:
          run: server
    ports:
    - protocol: TCP
      port: 80
`);
  sleep(5000);

  assert.ok(
    canReach("client-a", `http://server.${NS}.svc.cluster.local/`),
    "client-a should reach server after DNS + server egress is allowed",
  );
});

// ─── 8. Cleanup safety ───────────────────────────────────────────────────────

test("namespace cleanup completes without hanging", options, () => {
  env.kubectl("delete", "namespace", NS, "--timeout=60s");

  // Confirm the namespace is gone.
  const exists = env.kubectl("get", "namespace", NS, "--ignore-not-found", "-o", "name").trim();
  assert.equal(exists, "", `namespace ${NS} should be gone after delete`);
});
