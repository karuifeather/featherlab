/**
 * Level 6 Circuit C (HTTP matching k8s-0136–0139) + Circuit D (TLS k8s-0140–0143) scenarios.
 *
 * NOTE: k8s-0139–0143 scenarios are placeholders; update from the actual exercise.yaml
 * and setup/ manifests once the content agents complete.
 */

/** Poll until HTTPRoute has Accepted=True. */
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

/** Poll until curl returns non-empty through Traefik. */
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

// ─── Circuit C: HTTP Matching ─────────────────────────────────────────────────

export const LEVEL6_C_SCENARIOS = {
  "k8s-0136": {
    initial: [["httproute", "web-route", "fl-k8s-0136"]],
    async solve(k) {
      await k.ready("grader-client", "fl-k8s-0136");
      k.apply(`
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web-route
  namespace: fl-k8s-0136
spec:
  parentRefs:
    - name: web-gw
  hostnames:
    - "app.k8s-0136.fl.test"
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
      await waitForRoute(k, { name: "web-route", ns: "fl-k8s-0136" });
      await waitForHttp(k, {
        clientPod: "grader-client",
        ns: "fl-k8s-0136",
        host: "app.k8s-0136.fl.test",
        path: "api",
      });
    },
    variants: [
      {
        name: "/api still routes to app (broken setup)",
        async run(k) {
          await k.ready("grader-client", "fl-k8s-0136");
          // Setup already has /api → app (wrong); do nothing
        },
        failing: ["probe-api"],
      },
    ],
  },

  "k8s-0137": {
    initial: [["httproute", "web-route", "fl-k8s-0137"]],
    async solve(k) {
      await k.ready("grader-client", "fl-k8s-0137");
      k.apply(`
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web-route
  namespace: fl-k8s-0137
spec:
  parentRefs:
    - name: web-gw
  hostnames:
    - "app.k8s-0137.fl.test"
  rules:
    - matches:
        - headers:
            - name: X-User-Type
              value: premium
      backendRefs:
        - name: premium
          port: 80
    - backendRefs:
        - name: standard
          port: 80
`);
      await waitForRoute(k, { name: "web-route", ns: "fl-k8s-0137" });
      await waitForHttp(k, {
        clientPod: "grader-client",
        ns: "fl-k8s-0137",
        host: "app.k8s-0137.fl.test",
      });
    },
    variants: [
      {
        name: "still references vip (broken setup)",
        async run(k) {
          await k.ready("grader-client", "fl-k8s-0137");
          // Setup already has vip backendRef; do nothing
        },
        failing: ["route-accepted", "probe-default"],
      },
    ],
  },

  "k8s-0138": {
    initial: [["httproute", "web-route", "fl-k8s-0138"]],
    async solve(k) {
      await k.ready("grader-client", "fl-k8s-0138");
      k.apply(`
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web-route
  namespace: fl-k8s-0138
spec:
  parentRefs:
    - name: web-gw
  hostnames:
    - "app.k8s-0138.fl.test"
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /old
      filters:
        - type: RequestRedirect
          requestRedirect:
            path:
              type: ReplaceFullPath
              replaceFullPath: /current
            statusCode: 301
    - matches:
        - path:
            type: PathPrefix
            value: /current
      backendRefs:
        - name: web
          port: 80
`);
      await waitForRoute(k, { name: "web-route", ns: "fl-k8s-0138" });
      await waitForHttp(k, {
        clientPod: "grader-client",
        ns: "fl-k8s-0138",
        host: "app.k8s-0138.fl.test",
        path: "current",
      });
    },
    variants: [
      {
        name: "redirect rule not added",
        async run(k) {
          await k.ready("grader-client", "fl-k8s-0138");
          // Setup has only /current rule; do nothing
        },
        failing: ["probe-redirect"],
      },
      {
        name: "wrong redirect status code (302 instead of 301)",
        async run(k) {
          await k.ready("grader-client", "fl-k8s-0138");
          k.apply(`
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web-route
  namespace: fl-k8s-0138
spec:
  parentRefs:
    - name: web-gw
  hostnames:
    - "app.k8s-0138.fl.test"
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /old
      filters:
        - type: RequestRedirect
          requestRedirect:
            path:
              type: ReplaceFullPath
              replaceFullPath: /current
            statusCode: 302
    - matches:
        - path:
            type: PathPrefix
            value: /current
      backendRefs:
        - name: web
          port: 80
`);
          await waitForRoute(k, { name: "web-route", ns: "fl-k8s-0138" });
        },
        failing: ["probe-redirect"],
      },
    ],
  },

  "k8s-0139": {
    initial: [["httproute", "admin-route", "fl-k8s-0139"]],
    async solve(k) {
      await k.ready("grader-client", "fl-k8s-0139");
      // admin-route conflicts with app-route by matching PathPrefix /; fix it to /admin
      k.apply(`
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: admin-route
  namespace: fl-k8s-0139
spec:
  parentRefs:
    - name: web-gw
  hostnames:
    - "app.k8s-0139.fl.test"
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /admin
      backendRefs:
        - name: admin
          port: 80
`);
      await waitForRoute(k, { name: "admin-route", ns: "fl-k8s-0139" });
      await waitForHttp(k, {
        clientPod: "grader-client",
        ns: "fl-k8s-0139",
        host: "app.k8s-0139.fl.test",
        path: "admin",
      });
    },
    variants: [
      {
        name: "admin-route still matches / (not fixed)",
        async run(k) {
          await k.ready("grader-client", "fl-k8s-0139");
          // Setup has admin-route at PathPrefix /; do nothing.
          // app-route was created first and wins the conflict, so / still routes to app
          // (probe-root passes) but /admin also routes to app (probe-admin fails).
        },
        failing: ["probe-admin"],
      },
    ],
  },
};

// ─── Circuit D: TLS ───────────────────────────────────────────────────────────
// TLS exercises use k8s.routing-probe with https: true and --insecure curl.
// k8s-0141 through k8s-0143 are stubs; update from exercise content once the
// C/D content agent completes those exercises.

export const LEVEL6_D_SCENARIOS = {
  "k8s-0140": {
    initial: [["ingress", "web", "fl-k8s-0140"]],
    async solve(k) {
      await k.ready("grader-client", "fl-k8s-0140");
      k.apply(`
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
  namespace: fl-k8s-0140
spec:
  ingressClassName: traefik
  tls:
    - secretName: app-tls
      hosts:
        - app.k8s-0140.fl.test
  rules:
    - host: app.k8s-0140.fl.test
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
      await k.until("app.k8s-0140.fl.test HTTPS responds", () => {
        try {
          const out = k.run(
            "exec",
            "grader-client",
            "-n",
            "fl-k8s-0140",
            "--",
            "curl",
            "--silent",
            "--insecure",
            "--max-time",
            "5",
            "--connect-to",
            "app.k8s-0140.fl.test::traefik.traefik-system.svc.cluster.local:443",
            "https://app.k8s-0140.fl.test/",
          );
          return out.includes("web-response");
        } catch {
          return false;
        }
      });
    },
    variants: [
      {
        name: "TLS stanza not added",
        async run(k) {
          await k.ready("grader-client", "fl-k8s-0140");
          // Setup has no TLS stanza; do nothing
        },
        failing: ["ingress-tls", "https-probe"],
      },
    ],
  },

  "k8s-0141": {
    initial: [["gateway", "web-gw", "fl-k8s-0141"]],
    async solve(k) {
      await k.ready("grader-client", "fl-k8s-0141");
      // Add HTTPS listener to Gateway; HTTP listener already exists in setup
      k.apply(`
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: web-gw
  namespace: fl-k8s-0141
spec:
  gatewayClassName: traefik
  listeners:
    - name: http
      port: 80
      protocol: HTTP
      hostname: "app.k8s-0141.fl.test"
    - name: https
      port: 443
      protocol: HTTPS
      hostname: "app.k8s-0141.fl.test"
      tls:
        mode: Terminate
        certificateRefs:
          - name: app-tls
`);
      await k.until("app.k8s-0141.fl.test HTTPS responds", () => {
        try {
          const out = k.run(
            "exec",
            "grader-client",
            "-n",
            "fl-k8s-0141",
            "--",
            "curl",
            "--silent",
            "--insecure",
            "--max-time",
            "5",
            "--connect-to",
            "app.k8s-0141.fl.test::traefik.traefik-system.svc.cluster.local:443",
            "https://app.k8s-0141.fl.test/",
          );
          return out.includes("web-response");
        } catch {
          return false;
        }
      });
    },
    variants: [
      {
        name: "HTTPS listener not added",
        async run(k) {
          await k.ready("grader-client", "fl-k8s-0141");
          // Setup has HTTP listener only; do nothing
        },
        failing: ["https-probe"],
      },
    ],
  },

  "k8s-0142": {
    initial: [["ingress", "web", "fl-k8s-0142"]],
    async solve(k) {
      await k.ready("grader-client", "fl-k8s-0142");
      // Fix secretName: wrong-tls-secret → correct-tls
      k.apply(`
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
  namespace: fl-k8s-0142
spec:
  ingressClassName: traefik
  tls:
    - hosts:
        - app.k8s-0142.fl.test
      secretName: correct-tls
  rules:
    - host: app.k8s-0142.fl.test
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
      await k.until("app.k8s-0142.fl.test HTTPS responds", () => {
        try {
          const out = k.run(
            "exec",
            "grader-client",
            "-n",
            "fl-k8s-0142",
            "--",
            "curl",
            "--silent",
            "--insecure",
            "--max-time",
            "5",
            "--connect-to",
            "app.k8s-0142.fl.test::traefik.traefik-system.svc.cluster.local:443",
            "https://app.k8s-0142.fl.test/",
          );
          return out.includes("web-response");
        } catch {
          return false;
        }
      });
    },
    variants: [
      {
        name: "wrong secretName still in place",
        async run(k) {
          await k.ready("grader-client", "fl-k8s-0142");
          // Setup already has wrong-tls-secret; do nothing
        },
        // With --entrypoints.websecure.http.tls=true, Traefik falls back to its default
        // cert when the referenced secret is missing, so --insecure probe still returns 200.
        failing: ["ingress-tls"],
      },
    ],
  },

  "k8s-0143": {
    initial: [["gateway", "secure-gw", "fl-k8s-0143"]],
    async solve(k) {
      await k.ready("grader-client", "fl-k8s-0143");
      // Add HTTPS listener named "https" — HTTPRoute's sectionName: https requires this name
      k.apply(`
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: secure-gw
  namespace: fl-k8s-0143
spec:
  gatewayClassName: traefik
  listeners:
    - name: http
      port: 80
      protocol: HTTP
      hostname: "app.k8s-0143.fl.test"
    - name: https
      port: 443
      protocol: HTTPS
      hostname: "app.k8s-0143.fl.test"
      tls:
        mode: Terminate
        certificateRefs:
          - name: app-tls
`);
      await k.until("app.k8s-0143.fl.test HTTPS responds", () => {
        try {
          const out = k.run(
            "exec",
            "grader-client",
            "-n",
            "fl-k8s-0143",
            "--",
            "curl",
            "--silent",
            "--insecure",
            "--max-time",
            "5",
            "--connect-to",
            "app.k8s-0143.fl.test::traefik.traefik-system.svc.cluster.local:443",
            "https://app.k8s-0143.fl.test/",
          );
          return out.includes("secure-app");
        } catch {
          return false;
        }
      });
    },
    variants: [
      {
        name: "HTTPS listener not added",
        async run(k) {
          await k.ready("grader-client", "fl-k8s-0143");
          // Setup has HTTP listener only; HTTPRoute references sectionName: https → NoMatchingParent
        },
        failing: ["route-accepted", "https-probe"],
      },
    ],
  },
};
