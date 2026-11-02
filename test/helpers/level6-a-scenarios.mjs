/**
 * Level 6 Circuit A scenarios: Ingress resources (k8s-0125–0129).
 *
 * Each scenario acts the way a learner would: plain kubectl in the workstation, against
 * a freshly prepared exercise.
 *
 *   solve(k)    - the reference solution; the exercise must then pass
 *   variants    - plausible mistakes; each must fail exactly the listed checks
 *   initial     - objects setup must have created (verified before baseline check)
 *
 * All routing probes connect through Traefik (pre-installed in the test cluster).
 * solve() waits for Traefik to reconcile the rule before returning.
 */

/** Poll until curl through Traefik returns HTTP 200 for the given host/path. */
async function waitForRoute(k, { clientPod, ns, host, path = "" }) {
  await k.until(`${host}${path} responds`, () => {
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
        `http://${host}/${path}`,
      );
      return out.length > 0;
    } catch {
      return false;
    }
  });
}

export const LEVEL6_A_SCENARIOS = {
  "k8s-0125": {
    initial: [["deployment", "web", "fl-k8s-0125"]],
    async solve(k) {
      await k.ready("grader-client", "fl-k8s-0125");
      k.apply(`
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
  namespace: fl-k8s-0125
spec:
  ingressClassName: traefik
  rules:
    - host: app.k8s-0125.fl.test
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web
                port:
                  number: 80
`);
      await waitForRoute(k, {
        clientPod: "grader-client",
        ns: "fl-k8s-0125",
        host: "app.k8s-0125.fl.test",
      });
    },
    variants: [
      {
        name: "wrong ingressClassName",
        async run(k) {
          await k.ready("grader-client", "fl-k8s-0125");
          k.apply(`
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
  namespace: fl-k8s-0125
spec:
  ingressClassName: nginx
  rules:
    - host: app.k8s-0125.fl.test
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web
                port:
                  number: 80
`);
        },
        failing: ["ingress-spec", "http"],
      },
      {
        name: "wrong hostname",
        async run(k) {
          await k.ready("grader-client", "fl-k8s-0125");
          k.apply(`
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
  namespace: fl-k8s-0125
spec:
  ingressClassName: traefik
  rules:
    - host: wrong.k8s-0125.fl.test
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web
                port:
                  number: 80
`);
        },
        failing: ["ingress-spec", "http"],
      },
    ],
  },

  "k8s-0126": {
    initial: [["ingress", "web", "fl-k8s-0126"]],
    async solve(k) {
      await k.ready("grader-client", "fl-k8s-0126");
      k.apply(`
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
  namespace: fl-k8s-0126
spec:
  ingressClassName: traefik
  rules:
    - host: frontend.k8s-0126.fl.test
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend
                port:
                  number: 80
    - host: api.k8s-0126.fl.test
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api
                port:
                  number: 80
`);
      await waitForRoute(k, {
        clientPod: "grader-client",
        ns: "fl-k8s-0126",
        host: "api.k8s-0126.fl.test",
      });
    },
    variants: [],
  },

  "k8s-0127": {
    initial: [["ingress", "web", "fl-k8s-0127"]],
    async solve(k) {
      await k.ready("grader-client", "fl-k8s-0127");
      k.apply(`
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
  namespace: fl-k8s-0127
spec:
  ingressClassName: traefik
  rules:
    - host: k8s-0127.fl.test
      http:
        paths:
          - path: /app
            pathType: Prefix
            backend:
              service:
                name: app
                port:
                  number: 80
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: api
                port:
                  number: 80
`);
      await waitForRoute(k, {
        clientPod: "grader-client",
        ns: "fl-k8s-0127",
        host: "k8s-0127.fl.test",
        path: "api",
      });
    },
    variants: [
      {
        name: "wrong path type Exact for /api",
        async run(k) {
          await k.ready("grader-client", "fl-k8s-0127");
          k.apply(`
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
  namespace: fl-k8s-0127
spec:
  ingressClassName: traefik
  rules:
    - host: k8s-0127.fl.test
      http:
        paths:
          - path: /app
            pathType: Prefix
            backend:
              service:
                name: app
                port:
                  number: 80
          - path: /api
            pathType: Exact
            backend:
              service:
                name: api
                port:
                  number: 80
`);
        },
        failing: ["ingress-spec"],
      },
    ],
  },

  "k8s-0128": {
    initial: [["ingress", "web", "fl-k8s-0128"]],
    async solve(k) {
      await k.ready("grader-client", "fl-k8s-0128");
      k.apply(`
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
  namespace: fl-k8s-0128
spec:
  ingressClassName: traefik
  rules:
    - host: app.k8s-0128.fl.test
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web
                port:
                  number: 80
`);
      await waitForRoute(k, {
        clientPod: "grader-client",
        ns: "fl-k8s-0128",
        host: "app.k8s-0128.fl.test",
      });
    },
    variants: [],
  },

  "k8s-0129": {
    initial: [["ingress", "app", "fl-k8s-0129"]],
    async solve(k) {
      await k.ready("grader-client", "fl-k8s-0129");
      k.apply(`
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app
  namespace: fl-k8s-0129
spec:
  ingressClassName: traefik
  rules:
    - host: app.k8s-0129.fl.test
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: app
                port:
                  number: 8080
`);
      await waitForRoute(k, {
        clientPod: "grader-client",
        ns: "fl-k8s-0129",
        host: "app.k8s-0129.fl.test",
      });
    },
    variants: [],
  },
};
