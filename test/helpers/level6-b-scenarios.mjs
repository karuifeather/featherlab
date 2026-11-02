/**
 * Level 6 Circuit B scenarios: Gateway API (k8s-0130–0135).
 *
 * k8s-0130: Inspect GatewayClass, record controllerName in ConfigMap
 * k8s-0131: Create Gateway + HTTPRoute from scratch
 * k8s-0132: Create v2-route HTTPRoute (v1-route pre-exists)
 * k8s-0133: Add /api rule to existing HTTPRoute
 * k8s-0134: Fix parentRef: wrong-gw → main-gw
 * k8s-0135: Fix backendRef: missing-service → app
 */

/** Poll until the HTTPRoute has Accepted=True in its parent status. */
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

/** Poll until curl through Traefik returns a non-empty response. */
async function waitForHttp(k, { clientPod, ns, host, path = "" }) {
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
        `http://${host}/${path}`,
      );
      return out.length > 0;
    } catch {
      return false;
    }
  });
}

export const LEVEL6_B_SCENARIOS = {
  "k8s-0130": {
    async solve(k) {
      k.run(
        "create",
        "configmap",
        "my-notes",
        "--from-literal=controllerName=traefik.io/gateway-controller",
        "-n",
        "fl-k8s-0130",
      );
    },
    variants: [
      {
        name: "wrong controllerName value",
        async run(k) {
          k.run(
            "create",
            "configmap",
            "my-notes",
            "--from-literal=controllerName=traefik.io/wrong-controller",
            "-n",
            "fl-k8s-0130",
          );
        },
        failing: ["notes-data"],
      },
      {
        name: "configmap missing entirely",
        async run() {
          // Do nothing — ConfigMap not created
        },
        failing: ["notes-exists", "notes-data"],
      },
    ],
  },

  "k8s-0131": {
    initial: [["deployment", "backend", "fl-k8s-0131"]],
    async solve(k) {
      await k.ready("grader-client", "fl-k8s-0131");
      k.apply(`
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: my-gateway
  namespace: fl-k8s-0131
spec:
  gatewayClassName: traefik
  listeners:
    - name: http
      port: 80
      protocol: HTTP
      hostname: "app.k8s-0131.fl.test"
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: my-route
  namespace: fl-k8s-0131
spec:
  parentRefs:
    - name: my-gateway
  hostnames:
    - "app.k8s-0131.fl.test"
  rules:
    - backendRefs:
        - name: backend
          port: 80
`);
      await waitForRoute(k, { name: "my-route", ns: "fl-k8s-0131" });
      await waitForHttp(k, {
        clientPod: "grader-client",
        ns: "fl-k8s-0131",
        host: "app.k8s-0131.fl.test",
      });
    },
    variants: [
      {
        name: "wrong gatewayClassName",
        async run(k) {
          await k.ready("grader-client", "fl-k8s-0131");
          k.apply(`
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: my-gateway
  namespace: fl-k8s-0131
spec:
  gatewayClassName: nginx
  listeners:
    - name: http
      port: 80
      protocol: HTTP
      hostname: "app.k8s-0131.fl.test"
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: my-route
  namespace: fl-k8s-0131
spec:
  parentRefs:
    - name: my-gateway
  hostnames:
    - "app.k8s-0131.fl.test"
  rules:
    - backendRefs:
        - name: backend
          port: 80
`);
        },
        failing: ["gateway-ready", "route-accepted", "http-probe"],
      },
      {
        name: "HTTPRoute missing (Gateway only)",
        async run(k) {
          await k.ready("grader-client", "fl-k8s-0131");
          k.apply(`
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: my-gateway
  namespace: fl-k8s-0131
spec:
  gatewayClassName: traefik
  listeners:
    - name: http
      port: 80
      protocol: HTTP
      hostname: "app.k8s-0131.fl.test"
`);
        },
        failing: ["route-accepted", "http-probe"],
      },
    ],
  },

  "k8s-0132": {
    initial: [["httproute", "v1-route", "fl-k8s-0132"]],
    async solve(k) {
      await k.ready("grader-client", "fl-k8s-0132");
      k.apply(`
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: v2-route
  namespace: fl-k8s-0132
spec:
  parentRefs:
    - name: web-gw
  hostnames:
    - "v2.k8s-0132.fl.test"
  rules:
    - backendRefs:
        - name: v2
          port: 80
`);
      await waitForRoute(k, { name: "v2-route", ns: "fl-k8s-0132" });
      await waitForHttp(k, {
        clientPod: "grader-client",
        ns: "fl-k8s-0132",
        host: "v2.k8s-0132.fl.test",
      });
    },
    variants: [
      {
        name: "v2-route points to wrong backend",
        async run(k) {
          await k.ready("grader-client", "fl-k8s-0132");
          k.apply(`
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: v2-route
  namespace: fl-k8s-0132
spec:
  parentRefs:
    - name: web-gw
  hostnames:
    - "v2.k8s-0132.fl.test"
  rules:
    - backendRefs:
        - name: v1
          port: 80
`);
          await waitForRoute(k, { name: "v2-route", ns: "fl-k8s-0132" });
        },
        failing: ["probe-v2"],
      },
    ],
  },

  "k8s-0133": {
    initial: [["httproute", "web-route", "fl-k8s-0133"]],
    async solve(k) {
      await k.ready("grader-client", "fl-k8s-0133");
      k.apply(`
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web-route
  namespace: fl-k8s-0133
spec:
  parentRefs:
    - name: web-gw
  hostnames:
    - "k8s-0133.fl.test"
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /app
      backendRefs:
        - name: app
          port: 80
    - matches:
        - path:
            type: PathPrefix
            value: /api
      backendRefs:
        - name: api
          port: 80
`);
      await waitForRoute(k, { name: "web-route", ns: "fl-k8s-0133" });
      await waitForHttp(k, {
        clientPod: "grader-client",
        ns: "fl-k8s-0133",
        host: "k8s-0133.fl.test",
        path: "api/",
      });
    },
    variants: [
      {
        name: "/api mapped to wrong backend (app instead of api)",
        async run(k) {
          await k.ready("grader-client", "fl-k8s-0133");
          k.apply(`
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web-route
  namespace: fl-k8s-0133
spec:
  parentRefs:
    - name: web-gw
  hostnames:
    - "k8s-0133.fl.test"
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /app
      backendRefs:
        - name: app
          port: 80
    - matches:
        - path:
            type: PathPrefix
            value: /api
      backendRefs:
        - name: app
          port: 80
`);
          await waitForRoute(k, { name: "web-route", ns: "fl-k8s-0133" });
        },
        failing: ["probe-api"],
      },
    ],
  },

  "k8s-0134": {
    initial: [["httproute", "web-route", "fl-k8s-0134"]],
    async solve(k) {
      await k.ready("grader-client", "fl-k8s-0134");
      k.apply(`
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web-route
  namespace: fl-k8s-0134
spec:
  parentRefs:
    - name: main-gw
  hostnames:
    - "app.k8s-0134.fl.test"
  rules:
    - backendRefs:
        - name: web
          port: 80
`);
      await waitForRoute(k, { name: "web-route", ns: "fl-k8s-0134" });
      await waitForHttp(k, {
        clientPod: "grader-client",
        ns: "fl-k8s-0134",
        host: "app.k8s-0134.fl.test",
      });
    },
    variants: [],
  },

  "k8s-0135": {
    initial: [["httproute", "app-route", "fl-k8s-0135"]],
    async solve(k) {
      await k.ready("grader-client", "fl-k8s-0135");
      k.apply(`
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: app-route
  namespace: fl-k8s-0135
spec:
  parentRefs:
    - name: app-gw
  hostnames:
    - "app.k8s-0135.fl.test"
  rules:
    - backendRefs:
        - name: app
          port: 80
`);
      await waitForRoute(k, { name: "app-route", ns: "fl-k8s-0135" });
      await waitForHttp(k, {
        clientPod: "grader-client",
        ns: "fl-k8s-0135",
        host: "app.k8s-0135.fl.test",
      });
    },
    variants: [],
  },
};
