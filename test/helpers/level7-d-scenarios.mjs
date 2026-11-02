/**
 * Level 7 Circuit D scenarios: Combined Ingress+Egress (k8s-0166–k8s-0169).
 *
 * Each scenario acts the way a learner would: plain kubectl in the workstation,
 * against a freshly prepared exercise.
 *
 *   solve(k)    - the reference solution; all checks must pass after this
 *   variants    - plausible mistakes; each must fail exactly the listed checks
 *   initial     - objects setup must have created (verified before baseline check)
 *
 * NetworkPolicy enforcement in kindnet takes ~5 s to converge after an apply.
 * solve() waits until traffic is in the expected state before returning.
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

/** Poll until curl from the given client is blocked (non-zero exit). */
async function waitForBlock(k, { clientPod, ns, host, port = 80 }) {
  await k.until(`${host} blocked from ${clientPod}`, () => {
    try {
      k.run(
        "exec",
        clientPod,
        "-n",
        ns,
        "--",
        "curl",
        "-s",
        "--max-time",
        "5",
        `http://${host}:${port}/`,
      );
      return false; // curl succeeded — not blocked yet
    } catch {
      return true; // curl threw (non-zero exit) — blocked
    }
  });
}

// ─── k8s-0166: Bidirectional Isolation — Ingress AND Egress ──────────────────

export const LEVEL7_D_SCENARIOS = {
  "k8s-0166": {
    initial: [
      ["pod", "api", "fl-k8s-0166"],
      ["pod", "client", "fl-k8s-0166"],
      ["pod", "grader-client", "fl-k8s-0166"],
    ],
    async solve(k) {
      await k.ready("api", "fl-k8s-0166");
      await k.ready("client", "fl-k8s-0166");
      k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: isolate-client
  namespace: fl-k8s-0166
spec:
  podSelector:
    matchLabels:
      app: client
  policyTypes:
    - Ingress
    - Egress
`);
      await waitForBlock(k, {
        clientPod: "client",
        ns: "fl-k8s-0166",
        host: "api.fl-k8s-0166.svc.cluster.local",
      });
    },
    variants: [
      {
        name: "ingress-only isolation (missing Egress type)",
        async run(k) {
          await k.ready("api", "fl-k8s-0166");
          k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: isolate-client
  namespace: fl-k8s-0166
spec:
  podSelector:
    matchLabels:
      app: client
  policyTypes:
    - Ingress
`);
        },
        // Egress not in policyTypes → policy-exists fails (policyTypes missing Egress)
        // client's egress is unrestricted → DNS works, TCP connects → client-blocked may fail
        failing: ["policy-exists", "client-blocked"],
      },
    ],
  },

  // ─── k8s-0167: Least-Privilege Microservice ────────────────────────────────────

  "k8s-0167": {
    initial: [
      ["pod", "api", "fl-k8s-0167"],
      ["pod", "db", "fl-k8s-0167"],
      ["pod", "grader-client", "fl-k8s-0167"],
      ["pod", "deny-client", "fl-k8s-0167"],
    ],
    async solve(k) {
      await k.ready("api", "fl-k8s-0167");
      await k.ready("grader-client", "fl-k8s-0167");
      k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-least-privilege
  namespace: fl-k8s-0167
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: grader-client
      ports:
        - protocol: TCP
          port: 80
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: db
      ports:
        - protocol: TCP
          port: 5432
`);
      await waitForHttp(k, {
        clientPod: "grader-client",
        ns: "fl-k8s-0167",
        host: "api.fl-k8s-0167.svc.cluster.local",
      });
    },
    variants: [
      {
        name: "ingress-only (no egress section)",
        async run(k) {
          await k.ready("api", "fl-k8s-0167");
          k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-least-privilege
  namespace: fl-k8s-0167
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: grader-client
      ports:
        - protocol: TCP
          port: 80
`);
        },
        // policyTypes missing Egress and no egress rules → policy-exists fails
        failing: ["policy-exists"],
      },
    ],
  },

  // ─── k8s-0168: Fix a Policy Interaction Bug ────────────────────────────────────

  "k8s-0168": {
    initial: [
      ["pod", "api", "fl-k8s-0168"],
      ["pod", "grader-client", "fl-k8s-0168"],
      ["pod", "deny-client", "fl-k8s-0168"],
      ["networkpolicy", "allow-frontend-buggy", "fl-k8s-0168"],
    ],
    async solve(k) {
      await k.ready("api", "fl-k8s-0168");
      await k.ready("grader-client", "fl-k8s-0168");
      k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-buggy
  namespace: fl-k8s-0168
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              role: frontend
      ports:
        - protocol: TCP
          port: 80
`);
      await waitForHttp(k, {
        clientPod: "grader-client",
        ns: "fl-k8s-0168",
        host: "api.fl-k8s-0168.svc.cluster.local",
      });
    },
    variants: [],
  },

  // ─── k8s-0169: Multi-Tier Connectivity ────────────────────────────────────────

  "k8s-0169": {
    initial: [
      ["pod", "frontend", "fl-k8s-0169"],
      ["pod", "backend", "fl-k8s-0169"],
      ["pod", "grader-client", "fl-k8s-0169"],
      ["pod", "deny-client", "fl-k8s-0169"],
    ],
    async solve(k) {
      await k.ready("frontend", "fl-k8s-0169");
      await k.ready("backend", "fl-k8s-0169");
      await k.ready("grader-client", "fl-k8s-0169");
      k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: backend-access
  namespace: fl-k8s-0169
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: frontend
`);
      await waitForHttp(k, {
        clientPod: "grader-client",
        ns: "fl-k8s-0169",
        host: "frontend.fl-k8s-0169.svc.cluster.local",
      });
      await waitForBlock(k, {
        clientPod: "deny-client",
        ns: "fl-k8s-0169",
        host: "backend.fl-k8s-0169.svc.cluster.local",
      });
    },
    variants: [
      {
        name: "policy not created",
        async run(k) {
          await k.ready("frontend", "fl-k8s-0169");
          await k.ready("backend", "fl-k8s-0169");
          await k.ready("deny-client", "fl-k8s-0169");
          // kindnet takes a few seconds to clear iptables after the previous policy is
          // removed by reset; wait until deny-client can actually reach backend freely
          await k.until("deny-client can reach backend (no policy)", () => {
            try {
              k.run(
                "exec",
                "deny-client",
                "-n",
                "fl-k8s-0169",
                "--",
                "curl",
                "-s",
                "--max-time",
                "5",
                "http://backend.fl-k8s-0169.svc.cluster.local/",
              );
              return true;
            } catch {
              return false;
            }
          });
        },
        failing: ["backend-access-policy", "backend-blocked"],
      },
      {
        name: "backend-access selects all pods (podSelector: {}) instead of just backend",
        async run(k) {
          await k.ready("frontend", "fl-k8s-0169");
          await k.ready("backend", "fl-k8s-0169");
          k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: backend-access
  namespace: fl-k8s-0169
spec:
  podSelector: {}
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: frontend
`);
        },
        // podSelector: {} doesn't match {matchLabels: {app: backend}} → policy-exists fails
        // frontend is now also restricted (podSelector: {} affects all pods)
        // grader-client (no app=frontend) cannot reach frontend → frontend-reachable fails
        failing: ["backend-access-policy", "frontend-reachable"],
      },
    ],
  },
};
