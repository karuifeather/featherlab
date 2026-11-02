/**
 * Level 6 Circuit E (cross-namespace) + Circuit F (weighted routing) + Mastery scenarios.
 *
 * Circuit E: k8s-0144–0147 — ReferenceGrant for cross-namespace backend references.
 * Circuit F: k8s-0148–0149 — HTTPRoute backendRef weights.
 * Mastery:   k8s-0150       — combined Ingress + cross-namespace + weighted routing.
 *
 * NOTE: Circuit E scenarios (k8s-0144–0147) are filled in after exercises are authored.
 * The solve() and variants here are placeholders; update from the actual exercise.yaml
 * and setup/ manifests once the content agents complete.
 */

/** Poll until HTTPRoute has Accepted=True in parent status. */
async function waitForRoute(k, { name, ns }) {
  await k.until(`HTTPRoute ${name} accepted`, () => {
    try {
      const out = k.run(
        "get",
        "httproute",
        name,
        "-n",
        ns,
        "-o",
        "jsonpath={.status.parents[0].conditions[?(@.type=='Accepted')].status}",
      );
      return out.trim() === "True";
    } catch {
      return false;
    }
  });
}

/** Poll until curl returns a non-empty response through Traefik. */
async function waitForHttp(k, { clientPod, ns, host }) {
  await k.until(`${host} responds`, () => {
    try {
      const out = k.run(
        "exec",
        clientPod,
        "-n",
        ns,
        "--",
        "curl",
        "--silent",
        "--max-time",
        "5",
        "--connect-to",
        `${host}::traefik.traefik-system.svc.cluster.local:80`,
        `http://${host}/`,
      );
      return out.length > 0;
    } catch {
      return false;
    }
  });
}

// ─── Circuit E: Cross-Namespace Routing ──────────────────────────────────────
// These scenarios are derived from exercises k8s-0144–0147. They depend on the
// setup manifests in exercises/kubernetes/level-6/144-*/setup/ through 147-*/setup/.
// Fill these in by reading each setup/resources.yaml and solution.md.

export const LEVEL6_E_SCENARIOS = {
  "k8s-0144": {
    initial: [["httproute", "web-route", "fl-k8s-0144"]],
    async solve(k) {
      await k.ready("grader-client", "fl-k8s-0144");
      k.apply(`
apiVersion: gateway.networking.k8s.io/v1beta1
kind: ReferenceGrant
metadata:
  name: allow-from-ingress-ns
  namespace: fl-k8s-0144-backend
spec:
  from:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      namespace: fl-k8s-0144
  to:
    - group: ""
      kind: Service
`);
      await waitForRoute(k, { name: "web-route", ns: "fl-k8s-0144" });
      await waitForHttp(k, {
        clientPod: "grader-client",
        ns: "fl-k8s-0144",
        host: "app.k8s-0144.fl.test",
      });
    },
    variants: [],
  },

  "k8s-0145": {
    async solve(k) {
      await k.ready("grader-client", "fl-k8s-0145");
      k.apply(`
apiVersion: gateway.networking.k8s.io/v1beta1
kind: ReferenceGrant
metadata:
  name: allow-from-ingress-ns
  namespace: fl-k8s-0145-backend
spec:
  from:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      namespace: fl-k8s-0145
  to:
    - group: ""
      kind: Service
`);
      await waitForRoute(k, { name: "web-route", ns: "fl-k8s-0145" });
      await waitForHttp(k, {
        clientPod: "grader-client",
        ns: "fl-k8s-0145",
        host: "app.k8s-0145.fl.test",
      });
    },
    variants: [],
  },

  "k8s-0146": {
    async solve(k) {
      await k.ready("grader-client", "fl-k8s-0146");
      k.apply(`
apiVersion: gateway.networking.k8s.io/v1beta1
kind: ReferenceGrant
metadata:
  name: allow-from-gw-ns
  namespace: fl-k8s-0146-v1
spec:
  from:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      namespace: fl-k8s-0146
  to:
    - group: ""
      kind: Service
`);
      k.apply(`
apiVersion: gateway.networking.k8s.io/v1beta1
kind: ReferenceGrant
metadata:
  name: allow-from-gw-ns
  namespace: fl-k8s-0146-v2
spec:
  from:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      namespace: fl-k8s-0146
  to:
    - group: ""
      kind: Service
`);
      await waitForRoute(k, { name: "api-route", ns: "fl-k8s-0146" });
    },
    variants: [
      {
        name: "only one of two grants created",
        async run(k) {
          await k.ready("grader-client", "fl-k8s-0146");
          k.apply(`
apiVersion: gateway.networking.k8s.io/v1beta1
kind: ReferenceGrant
metadata:
  name: allow-from-gw-ns
  namespace: fl-k8s-0146-v1
spec:
  from:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      namespace: fl-k8s-0146
  to:
    - group: ""
      kind: Service
`);
        },
        failing: ["grant-v2-exists", "route-accepted"],
      },
    ],
  },

  "k8s-0147": {
    async solve(k) {
      await k.ready("grader-client", "fl-k8s-0147");
      // Setup has a broken ReferenceGrant with from[0].namespace: wrong-namespace.
      // Apply the corrected grant; kubectl apply patches it in place.
      k.apply(`
apiVersion: gateway.networking.k8s.io/v1beta1
kind: ReferenceGrant
metadata:
  name: allow-from-gw-ns
  namespace: fl-k8s-0147-api
spec:
  from:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      namespace: fl-k8s-0147
  to:
    - group: ""
      kind: Service
`);
      await waitForRoute(k, { name: "api-route", ns: "fl-k8s-0147" });
      await waitForHttp(k, {
        clientPod: "grader-client",
        ns: "fl-k8s-0147",
        host: "api.k8s-0147.fl.test",
      });
    },
    variants: [],
  },
};

// ─── Circuit F: Weighted Routing ─────────────────────────────────────────────

export const LEVEL6_F_SCENARIOS = {
  "k8s-0148": {
    initial: [["httproute", "app-route", "fl-k8s-0148"]],
    async solve(k) {
      await k.ready("grader-client", "fl-k8s-0148");
      k.apply(`
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: app-route
  namespace: fl-k8s-0148
spec:
  parentRefs:
    - name: app-gw
  hostnames:
    - "app.k8s-0148.fl.test"
  rules:
    - backendRefs:
        - name: web-stable
          port: 80
          weight: 90
        - name: web-canary
          port: 80
          weight: 10
`);
      await waitForRoute(k, { name: "app-route", ns: "fl-k8s-0148" });
      await waitForHttp(k, {
        clientPod: "grader-client",
        ns: "fl-k8s-0148",
        host: "app.k8s-0148.fl.test",
      });
    },
    variants: [
      {
        name: "weights reversed (10 stable / 90 canary)",
        async run(k) {
          await k.ready("grader-client", "fl-k8s-0148");
          k.apply(`
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: app-route
  namespace: fl-k8s-0148
spec:
  parentRefs:
    - name: app-gw
  hostnames:
    - "app.k8s-0148.fl.test"
  rules:
    - backendRefs:
        - name: web-stable
          port: 80
          weight: 10
        - name: web-canary
          port: 80
          weight: 90
`);
          await waitForRoute(k, { name: "app-route", ns: "fl-k8s-0148" });
        },
        failing: ["route-weights"],
      },
    ],
  },

  "k8s-0149": {
    initial: [["httproute", "api-route", "fl-k8s-0149"]],
    async solve(k) {
      await k.ready("grader-client", "fl-k8s-0149");
      k.apply(`
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: api-route
  namespace: fl-k8s-0149
spec:
  parentRefs:
    - name: api-gw
  hostnames:
    - "api.k8s-0149.fl.test"
  rules:
    - backendRefs:
        - name: api-v1
          port: 80
          weight: 0
        - name: api-v2
          port: 80
          weight: 100
`);
      k.run("scale", "deployment", "api-v1", "--replicas=0", "-n", "fl-k8s-0149");
      await waitForRoute(k, { name: "api-route", ns: "fl-k8s-0149" });
      await waitForHttp(k, {
        clientPod: "grader-client",
        ns: "fl-k8s-0149",
        host: "api.k8s-0149.fl.test",
      });
    },
    variants: [
      {
        name: "weights updated but v1 not scaled down",
        async run(k) {
          await k.ready("grader-client", "fl-k8s-0149");
          k.apply(`
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: api-route
  namespace: fl-k8s-0149
spec:
  parentRefs:
    - name: api-gw
  hostnames:
    - "api.k8s-0149.fl.test"
  rules:
    - backendRefs:
        - name: api-v1
          port: 80
          weight: 0
        - name: api-v2
          port: 80
          weight: 100
`);
          await waitForRoute(k, { name: "api-route", ns: "fl-k8s-0149" });
        },
        failing: ["v1-scaled-down"],
      },
      {
        name: "v1 scaled down but weights not updated (50/50)",
        async run(k) {
          await k.ready("grader-client", "fl-k8s-0149");
          k.run("scale", "deployment", "api-v1", "--replicas=0", "-n", "fl-k8s-0149");
        },
        failing: ["route-weights"],
      },
    ],
  },

  // ─── Mastery ───────────────────────────────────────────────────────────────
  "k8s-0150": {
    initial: [["ingress", "web-ingress", "fl-k8s-0150"]],
    async solve(k) {
      await k.ready("grader-client", "fl-k8s-0150");

      // Step 1: Fix the Ingress (ingressClassName: nonexistent → traefik)
      k.apply(`
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web-ingress
  namespace: fl-k8s-0150
spec:
  ingressClassName: traefik
  rules:
    - host: web.k8s-0150.fl.test
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend
                port:
                  number: 80
`);

      // Step 2: Create ReferenceGrant in backend namespace
      k.apply(`
apiVersion: gateway.networking.k8s.io/v1beta1
kind: ReferenceGrant
metadata:
  name: allow-httproute
  namespace: fl-k8s-0150-backend
spec:
  from:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      namespace: fl-k8s-0150
  to:
    - group: ""
      kind: Service
`);

      // Step 3: Update HTTPRoute weights to 80/20
      k.apply(`
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: api-route
  namespace: fl-k8s-0150
spec:
  parentRefs:
    - name: main-gw
  hostnames:
    - "api.k8s-0150.fl.test"
  rules:
    - backendRefs:
        - name: api-v1
          namespace: fl-k8s-0150-backend
          port: 80
          weight: 80
        - name: api-v2
          namespace: fl-k8s-0150-backend
          port: 80
          weight: 20
`);

      await waitForRoute(k, { name: "api-route", ns: "fl-k8s-0150" });
      // Wait for Ingress to propagate
      await k.until("web.k8s-0150.fl.test responds", () => {
        try {
          const out = k.run(
            "exec",
            "grader-client",
            "-n",
            "fl-k8s-0150",
            "--",
            "curl",
            "--silent",
            "--max-time",
            "5",
            "--connect-to",
            "web.k8s-0150.fl.test::traefik.traefik-system.svc.cluster.local:80",
            "http://web.k8s-0150.fl.test/",
          );
          return out.length > 0;
        } catch {
          return false;
        }
      });
    },
    variants: [
      {
        name: "ingress fixed but ReferenceGrant missing",
        async run(k) {
          await k.ready("grader-client", "fl-k8s-0150");
          k.apply(`
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web-ingress
  namespace: fl-k8s-0150
spec:
  ingressClassName: traefik
  rules:
    - host: web.k8s-0150.fl.test
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend
                port:
                  number: 80
`);
          await k.until("web responds", () => {
            try {
              const out = k.run(
                "exec",
                "grader-client",
                "-n",
                "fl-k8s-0150",
                "--",
                "curl",
                "--silent",
                "--max-time",
                "5",
                "--connect-to",
                "web.k8s-0150.fl.test::traefik.traefik-system.svc.cluster.local:80",
                "http://web.k8s-0150.fl.test/",
              );
              return out.length > 0;
            } catch {
              return false;
            }
          });
        },
        failing: ["reference-grant-exists", "route-accepted", "route-weights"],
      },
    ],
  },
};
