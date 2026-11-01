/**
 * Level 7 Circuit C scenarios: Namespace & Pod Selectors (k8s-0161–k8s-0165).
 *
 * Each scenario acts the way a learner would: plain kubectl in the workstation,
 * against a freshly prepared exercise.
 *
 *   solve(k)    - the reference solution; all checks must pass after this
 *   variants    - plausible mistakes; each must fail exactly the listed checks
 *   initial     - objects setup must have created (verified before baseline check)
 *
 * NetworkPolicy enforcement in kindnet takes ~5 s to converge after an apply.
 * solve() waits until the allowed client can actually reach the server before
 * returning, so the circuit test sees a stable state.
 */

/** Poll until busybox wget succeeds from the given client. */
async function waitForHttp(k, { clientPod, ns, host, port = 80 }) {
  await k.until(`${host} responds via ${clientPod}`, () => {
    try {
      const out = k.run(
        "exec",
        clientPod,
        "-n",
        ns,
        "--",
        "wget",
        "-qO-",
        "-T",
        "5",
        `http://${host}:${port}/`,
      );
      return out.includes("nginx");
    } catch {
      return false;
    }
  });
}

// ─── k8s-0161: Allow Traffic from a Namespace ─────────────────────────────────

export const LEVEL7_C_SCENARIOS = {
  "k8s-0161": {
    initial: [
      ["pod", "api", "fl-k8s-0161"],
      ["pod", "deny-client", "fl-k8s-0161"],
      ["pod", "cross-ns-client", "fl-k8s-0161-client"],
      ["networkpolicy", "deny-all", "fl-k8s-0161"],
    ],
    async solve(k) {
      await k.ready("api", "fl-k8s-0161");
      await k.ready("cross-ns-client", "fl-k8s-0161-client");
      k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-from-staging
  namespace: fl-k8s-0161
spec:
  podSelector: {}
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: fl-k8s-0161-client
`);
      await waitForHttp(k, {
        clientPod: "cross-ns-client",
        ns: "fl-k8s-0161-client",
        host: "api.fl-k8s-0161.svc.cluster.local",
      });
    },
    variants: [
      {
        name: "policy not created (no allow-from-staging)",
        async run(k) {
          await k.ready("api", "fl-k8s-0161");
          // Do nothing — deny-all remains, no allow policy.
        },
        failing: ["policy-exists", "cross-ns-allowed"],
      },
      {
        name: "wrong label in namespaceSelector (uses env: staging instead of metadata.name)",
        async run(k) {
          await k.ready("api", "fl-k8s-0161");
          k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-from-staging
  namespace: fl-k8s-0161
spec:
  podSelector: {}
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              env: staging
`);
        },
        // env: staging label doesn't exist on the namespace → cross-ns-client still blocked.
        failing: ["cross-ns-allowed"],
      },
    ],
  },

  // ─── k8s-0162: Combined Namespace + Pod Selector (AND logic) ─────────────────

  "k8s-0162": {
    initial: [
      ["pod", "api", "fl-k8s-0162"],
      ["pod", "deny-client", "fl-k8s-0162"],
      ["pod", "authorized-client", "fl-k8s-0162-client"],
      ["networkpolicy", "deny-all", "fl-k8s-0162"],
    ],
    async solve(k) {
      await k.ready("api", "fl-k8s-0162");
      await k.ready("authorized-client", "fl-k8s-0162-client");
      k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-prod-frontend
  namespace: fl-k8s-0162
spec:
  podSelector: {}
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: fl-k8s-0162-client
          podSelector:
            matchLabels:
              role: frontend
`);
      await waitForHttp(k, {
        clientPod: "authorized-client",
        ns: "fl-k8s-0162-client",
        host: "api.fl-k8s-0162.svc.cluster.local",
      });
    },
    variants: [
      {
        name: "policy not created",
        async run(k) {
          await k.ready("api", "fl-k8s-0162");
        },
        failing: ["policy-exists", "cross-ns-allowed"],
      },
      {
        name: "wrong podSelector label (role: backend instead of frontend)",
        async run(k) {
          await k.ready("api", "fl-k8s-0162");
          k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-prod-frontend
  namespace: fl-k8s-0162
spec:
  podSelector: {}
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: fl-k8s-0162-client
          podSelector:
            matchLabels:
              role: backend
`);
        },
        // authorized-client has role=frontend, not backend → still blocked
        failing: ["cross-ns-allowed"],
      },
    ],
  },

  // ─── k8s-0163: Isolate a Namespace ────────────────────────────────────────────

  "k8s-0163": {
    initial: [
      ["pod", "api", "fl-k8s-0163"],
      ["pod", "deny-client", "fl-k8s-0163"],
    ],
    async solve(k) {
      await k.ready("api", "fl-k8s-0163");
      await k.ready("deny-client", "fl-k8s-0163");
      k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: isolate-namespace
  namespace: fl-k8s-0163
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
`);
      // Wait for kindnet to converge the egress block (deny-client DNS blocked).
      await k.until("deny-client egress blocked", () => {
        try {
          k.run(
            "exec",
            "deny-client",
            "-n",
            "fl-k8s-0163",
            "--",
            "curl",
            "-s",
            "--max-time",
            "5",
            "http://api.fl-k8s-0163.svc.cluster.local/",
          );
          return false; // curl succeeded — not blocked yet
        } catch {
          return true; // curl threw (non-zero exit) — blocked
        }
      });
    },
    variants: [
      {
        name: "policy not created",
        async run(k) {
          await k.ready("api", "fl-k8s-0163");
        },
        failing: ["policy-exists", "egress-blocked"],
      },
      {
        name: "ingress-only policy (missing Egress type)",
        async run(k) {
          await k.ready("api", "fl-k8s-0163");
          k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: isolate-namespace
  namespace: fl-k8s-0163
spec:
  podSelector: {}
  policyTypes:
    - Ingress
`);
        },
        // Missing Egress in policyTypes → policy-exists fails (Egress not declared)
        // deny-client's egress is unrestricted, but api's ingress is still default-denied
        // (podSelector: {} + policyTypes: [Ingress] → no ingress rules → api unreachable)
        // so egress-blocked still passes — only policy-exists should be in failing
        failing: ["policy-exists"],
      },
    ],
  },

  // ─── k8s-0164: Broken Policy Diagnostics ──────────────────────────────────────

  "k8s-0164": {
    initial: [
      ["pod", "api", "fl-k8s-0164"],
      ["pod", "grader-client", "fl-k8s-0164"],
      ["pod", "deny-client", "fl-k8s-0164"],
      ["networkpolicy", "deny-all", "fl-k8s-0164"],
      ["networkpolicy", "allow-admin", "fl-k8s-0164"],
    ],
    async solve(k) {
      await k.ready("api", "fl-k8s-0164");
      await k.ready("grader-client", "fl-k8s-0164");
      k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-admin
  namespace: fl-k8s-0164
spec:
  podSelector: {}
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              role: admin
`);
      await waitForHttp(k, {
        clientPod: "grader-client",
        ns: "fl-k8s-0164",
        host: "api.fl-k8s-0164.svc.cluster.local",
      });
    },
    variants: [
      {
        name: "typo not fixed (role: adminn still in place)",
        async run(k) {
          await k.ready("api", "fl-k8s-0164");
          // Setup already has the broken policy; do nothing.
        },
        // grader-client (role=admin) can't reach api → probe-allowed fails
        failing: ["probe-allowed"],
      },
    ],
  },

  // ─── k8s-0165: Namespace Selector with kubernetes.io/metadata.name ────────────

  "k8s-0165": {
    initial: [
      ["pod", "api", "fl-k8s-0165"],
      ["pod", "deny-client", "fl-k8s-0165"],
      ["pod", "frontend-client", "fl-k8s-0165-frontend"],
      ["networkpolicy", "deny-all", "fl-k8s-0165"],
    ],
    async solve(k) {
      await k.ready("api", "fl-k8s-0165");
      await k.ready("frontend-client", "fl-k8s-0165-frontend");
      k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-from-frontend
  namespace: fl-k8s-0165
spec:
  podSelector: {}
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: fl-k8s-0165-frontend
`);
      await waitForHttp(k, {
        clientPod: "frontend-client",
        ns: "fl-k8s-0165-frontend",
        host: "api.fl-k8s-0165.svc.cluster.local",
      });
    },
    variants: [
      {
        name: "policy not created",
        async run(k) {
          await k.ready("api", "fl-k8s-0165");
        },
        failing: ["policy-exists", "frontend-allowed"],
      },
      {
        name: "namespaceSelector targets backend instead of frontend",
        async run(k) {
          await k.ready("api", "fl-k8s-0165");
          k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-from-frontend
  namespace: fl-k8s-0165
spec:
  podSelector: {}
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: fl-k8s-0165-backend
`);
        },
        // frontend-client (in fl-k8s-0165-frontend) still blocked
        failing: ["frontend-allowed"],
      },
    ],
  },
};
