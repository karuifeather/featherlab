/**
 * Level 7 Circuit E (protocols & ports) + Mastery scenarios.
 *
 * Circuit E: k8s-0170–0173 — protocol/port NetworkPolicy exercises.
 * Mastery:   k8s-0174       — three-tier application NetworkPolicy.
 *
 * All exercises use profile: kind-networkpolicy (kindnet CNI enforces NetworkPolicy).
 *
 * Pod topology per exercise:
 *   api          — bare Pod (nginx:1.27), label app=api; Service api:80
 *   grader-client — bare Pod (busybox:1.36), used with k8s.http-probe (wget)
 *   deny-client  — bare Pod (curlimages/curl:8.10.1), used with k8s.traffic-blocked (curl)
 *
 * After k.apply() of a NetworkPolicy, kindnet needs time to program iptables rules.
 * The waitForHttp / waitForBlock helpers poll until the expected state is reached.
 */

/**
 * Poll until grader-client can reach the api Service via wget.
 * Uses busybox wget inside the grader-client pod.
 */
async function waitForHttp(k, { ns, host, port = 80 }) {
  const url = `http://${host}:${port}/`;
  await k.until(`${host}:${port} reachable from grader-client`, () => {
    try {
      const out = k.run("exec", "grader-client", "-n", ns, "--", "wget", "-qO-", "-T", "5", url);
      return out.length > 0;
    } catch {
      return false;
    }
  });
}

/**
 * Poll until deny-client is blocked from reaching the host (curl exit 6, 7, or 28).
 * Uses curlimages/curl inside the deny-client pod.
 */
async function waitForBlock(k, { ns, host, port = 80 }) {
  const url = `http://${host}:${port}/`;
  await k.until(`${host}:${port} blocked for deny-client`, () => {
    try {
      k.run(
        "exec",
        "deny-client",
        "-n",
        ns,
        "--",
        "curl",
        "-s",
        "-o",
        "/dev/null",
        "-w",
        "%{http_code}",
        "--max-time",
        "5",
        url,
      );
      // curl exited 0 — traffic is still allowed
      return false;
    } catch {
      // non-zero exit (6, 7, or 28) — blocked
      return true;
    }
  });
}

// ─── Circuit E: k8s-0170 — TCP Protocol Policy ───────────────────────────────

export const LEVEL7_E_SCENARIOS = {
  "k8s-0170": {
    async solve(k) {
      await k.ready("grader-client", "fl-k8s-0170");
      await k.ready("deny-client", "fl-k8s-0170");
      await k.ready("api", "fl-k8s-0170");

      k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-role-allowed
  namespace: fl-k8s-0170
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
              role: allowed
      ports:
        - protocol: TCP
          port: 80
`);

      await waitForHttp(k, { ns: "fl-k8s-0170", host: "api" });
      await waitForBlock(k, { ns: "fl-k8s-0170", host: "api" });
    },

    variants: [
      {
        name: "policy not created (deny-all only)",
        async run(k) {
          await k.ready("grader-client", "fl-k8s-0170");
          await k.ready("deny-client", "fl-k8s-0170");
          await k.ready("api", "fl-k8s-0170");
          // Setup has deny-all; no allow rule added — baseline fails
        },
        failing: ["policy-spec", "http-probe"],
      },
      {
        name: "policy uses protocol: UDP instead of TCP",
        async run(k) {
          await k.ready("grader-client", "fl-k8s-0170");
          await k.ready("api", "fl-k8s-0170");

          k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-role-allowed
  namespace: fl-k8s-0170
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
              role: allowed
      ports:
        - protocol: UDP
          port: 80
`);
          // Policy exists with Ingress rules but http-probe (TCP/wget) fails
        },
        failing: ["http-probe"],
      },
    ],
  },

  // ─── k8s-0171 — Named Ports ────────────────────────────────────────────────

  "k8s-0171": {
    async solve(k) {
      await k.ready("grader-client", "fl-k8s-0171");
      await k.ready("deny-client", "fl-k8s-0171");
      await k.ready("api", "fl-k8s-0171");

      k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-http-port
  namespace: fl-k8s-0171
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
        - port: http
`);

      await waitForHttp(k, { ns: "fl-k8s-0171", host: "api" });
      await waitForBlock(k, { ns: "fl-k8s-0171", host: "api" });
    },

    variants: [
      {
        name: "policy not created (deny-all only)",
        async run(k) {
          await k.ready("grader-client", "fl-k8s-0171");
          await k.ready("api", "fl-k8s-0171");
          // deny-all from setup; no allow rule added
        },
        failing: ["policy-spec", "http-probe"],
      },
      {
        name: "policy uses wrong port number 8080",
        async run(k) {
          await k.ready("grader-client", "fl-k8s-0171");
          await k.ready("api", "fl-k8s-0171");

          k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-http-port
  namespace: fl-k8s-0171
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
        - port: 8080
`);
          // Policy exists structurally but opens port 8080, not 80 — http-probe fails
        },
        failing: ["http-probe"],
      },
    ],
  },

  // ─── k8s-0172 — Egress Port Restrictions ──────────────────────────────────

  "k8s-0172": {
    async solve(k) {
      await k.ready("grader-client", "fl-k8s-0172");
      await k.ready("api", "fl-k8s-0172");

      k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns-egress
  namespace: fl-k8s-0172
spec:
  podSelector:
    matchLabels:
      app: deny-client
  policyTypes:
    - Egress
  egress:
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kube-system
          podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53
`);

      k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-api-egress
  namespace: fl-k8s-0172
spec:
  podSelector:
    matchLabels:
      app: deny-client
  policyTypes:
    - Egress
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: api
      ports:
        - protocol: TCP
          port: 80
`);

      await waitForHttp(k, { ns: "fl-k8s-0172", host: "api" });
    },

    variants: [
      {
        name: "only dns-egress created (api-egress missing)",
        async run(k) {
          await k.ready("grader-client", "fl-k8s-0172");
          await k.ready("api", "fl-k8s-0172");

          k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns-egress
  namespace: fl-k8s-0172
spec:
  podSelector:
    matchLabels:
      app: deny-client
  policyTypes:
    - Egress
  egress:
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kube-system
          podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53
`);
        },
        failing: ["api-egress-spec"],
      },
      {
        name: "only api-egress created (dns-egress missing)",
        async run(k) {
          await k.ready("grader-client", "fl-k8s-0172");
          await k.ready("api", "fl-k8s-0172");

          k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-api-egress
  namespace: fl-k8s-0172
spec:
  podSelector:
    matchLabels:
      app: deny-client
  policyTypes:
    - Egress
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: api
      ports:
        - protocol: TCP
          port: 80
`);
        },
        failing: ["dns-egress-spec"],
      },
    ],
  },

  // ─── k8s-0173 — Least-Privilege Review ────────────────────────────────────

  "k8s-0173": {
    async solve(k) {
      await k.ready("grader-client", "fl-k8s-0173");
      await k.ready("deny-client", "fl-k8s-0173");
      await k.ready("api", "fl-k8s-0173");

      k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-access-control
  namespace: fl-k8s-0173
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
              role: monitor
      ports:
        - protocol: TCP
          port: 80
`);

      await waitForHttp(k, { ns: "fl-k8s-0173", host: "api" });
      await waitForBlock(k, { ns: "fl-k8s-0173", host: "api" });
    },

    variants: [
      {
        name: "policy not created (no policies)",
        async run(k) {
          await k.ready("grader-client", "fl-k8s-0173");
          await k.ready("deny-client", "fl-k8s-0173");
          await k.ready("api", "fl-k8s-0173");
          // No policies — all traffic allowed; traffic-blocked fails
        },
        failing: ["policy-spec", "traffic-blocked"],
      },
      {
        name: "policy selects wrong pods (app=api-v2 instead of api)",
        async run(k) {
          await k.ready("grader-client", "fl-k8s-0173");
          await k.ready("api", "fl-k8s-0173");

          k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-access-control
  namespace: fl-k8s-0173
spec:
  podSelector:
    matchLabels:
      app: api-v2
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              role: monitor
      ports:
        - protocol: TCP
          port: 80
`);
          // Policy exists but selects wrong pod — api pod unaffected, traffic-blocked fails
        },
        failing: ["policy-spec", "traffic-blocked"],
      },
    ],
  },

  // ─── k8s-0174 — Three-Tier Mastery ────────────────────────────────────────

  "k8s-0174": {
    async solve(k) {
      await k.ready("grader-client", "fl-k8s-0174");
      await k.ready("deny-client", "fl-k8s-0174");
      await k.ready("frontend", "fl-k8s-0174");
      await k.ready("api", "fl-k8s-0174");
      await k.ready("db", "fl-k8s-0174");

      k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: frontend-open
  namespace: fl-k8s-0174
spec:
  podSelector:
    matchLabels:
      app: frontend
  policyTypes:
    - Ingress
  ingress:
    - ports:
        - protocol: TCP
          port: 80
`);

      k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-from-frontend
  namespace: fl-k8s-0174
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
              app: frontend
      ports:
        - protocol: TCP
          port: 80
`);

      k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: db-from-api
  namespace: fl-k8s-0174
spec:
  podSelector:
    matchLabels:
      app: db
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: api
      ports:
        - protocol: TCP
          port: 80
`);

      await waitForHttp(k, { ns: "fl-k8s-0174", host: "frontend" });
      await waitForBlock(k, { ns: "fl-k8s-0174", host: "api" });
    },

    variants: [
      {
        name: "no policies created (all traffic open)",
        async run(k) {
          await k.ready("grader-client", "fl-k8s-0174");
          await k.ready("deny-client", "fl-k8s-0174");
          await k.ready("frontend", "fl-k8s-0174");
          await k.ready("api", "fl-k8s-0174");
          // No policies — all traffic allowed; api-blocked (traffic-blocked) fails
        },
        failing: [
          "frontend-open-spec",
          "api-from-frontend-spec",
          "db-from-api-spec",
          "api-blocked",
        ],
      },
      {
        name: "api-from-frontend missing (db-from-api also missing)",
        async run(k) {
          await k.ready("grader-client", "fl-k8s-0174");
          await k.ready("deny-client", "fl-k8s-0174");
          await k.ready("frontend", "fl-k8s-0174");
          await k.ready("api", "fl-k8s-0174");

          k.apply(`
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: frontend-open
  namespace: fl-k8s-0174
spec:
  podSelector:
    matchLabels:
      app: frontend
  policyTypes:
    - Ingress
  ingress:
    - ports:
        - protocol: TCP
          port: 80
`);

          await waitForHttp(k, { ns: "fl-k8s-0174", host: "frontend" });
          // api has no policy → deny-client can still reach api → api-blocked fails
        },
        failing: ["api-from-frontend-spec", "db-from-api-spec", "api-blocked"],
      },
    ],
  },
};
