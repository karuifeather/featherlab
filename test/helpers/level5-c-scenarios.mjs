/**
 * Level 5 Circuit C scenarios: DNS resolution and Service types.
 * k is a KubectlFacade with: k.run(...args) and k.apply(yaml).
 */

export const LEVEL5_C_SCENARIOS = {
  "k8s-0109": {
    initial: [["deployment", "api", "fl-k8s-0109"]],
    async solve(k) {
      k.run("expose", "deployment", "api", "--port=80", "--target-port=80", "-n", "fl-k8s-0109");
      k.run("rollout", "status", "deployment/api", "-n", "fl-k8s-0109", "--timeout=60s");
      await k.ready("grader-client", "fl-k8s-0109");
      await k.until("api dns resolves", () => {
        try {
          k.run(
            "exec",
            "grader-client",
            "-n",
            "fl-k8s-0109",
            "--",
            "nslookup",
            "api.fl-k8s-0109.svc.cluster.local",
          );
          return true;
        } catch {
          return false;
        }
      });
    },
    variants: [
      {
        name: "wrong selector — no endpoints",
        async run(k) {
          k.run("rollout", "status", "deployment/api", "-n", "fl-k8s-0109", "--timeout=60s");
          k.apply(`
apiVersion: v1
kind: Service
metadata:
  name: api
  namespace: fl-k8s-0109
spec:
  selector:
    app: wrong-label
  ports:
    - port: 80
      targetPort: 80
`);
        },
        failing: ["routes"],
      },
    ],
  },

  "k8s-0110": {
    initial: [["deployment", "catalog", "fl-k8s-0110-app"]],
    async solve(k) {
      k.run(
        "expose",
        "deployment",
        "catalog",
        "--port=80",
        "--target-port=80",
        "-n",
        "fl-k8s-0110-app",
      );
      k.run("rollout", "status", "deployment/catalog", "-n", "fl-k8s-0110-app", "--timeout=60s");
      await k.ready("grader-client", "fl-k8s-0110");
      await k.until("catalog dns resolves", () => {
        try {
          k.run(
            "exec",
            "grader-client",
            "-n",
            "fl-k8s-0110",
            "--",
            "nslookup",
            "catalog.fl-k8s-0110-app.svc.cluster.local",
          );
          return true;
        } catch {
          return false;
        }
      });
      await k.until("catalog http responds", () => {
        try {
          k.run(
            "exec",
            "grader-client",
            "-n",
            "fl-k8s-0110",
            "--",
            "wget",
            "-qO-",
            "-T",
            "5",
            "http://catalog.fl-k8s-0110-app:80/",
          );
          return true;
        } catch {
          return false;
        }
      });
    },
    variants: [
      {
        name: "service created in wrong namespace",
        async run(k) {
          k.run(
            "rollout",
            "status",
            "deployment/catalog",
            "-n",
            "fl-k8s-0110-app",
            "--timeout=60s",
          );
          k.apply(`
apiVersion: v1
kind: Service
metadata:
  name: catalog
  namespace: fl-k8s-0110
spec:
  selector:
    app: catalog
  ports:
    - port: 80
      targetPort: 80
`);
        },
        failing: ["routes", "dns", "http"],
      },
    ],
  },

  "k8s-0111": {
    initial: [["deployment", "metrics", "fl-k8s-0111"]],
    async solve(k) {
      k.run(
        "expose",
        "deployment",
        "metrics",
        "--port=80",
        "--target-port=80",
        "-n",
        "fl-k8s-0111",
      );
      k.run("rollout", "status", "deployment/metrics", "-n", "fl-k8s-0111", "--timeout=60s");
      await k.ready("grader-client", "fl-k8s-0111");
      await k.until("metrics dns resolves", () => {
        try {
          k.run(
            "exec",
            "grader-client",
            "-n",
            "fl-k8s-0111",
            "--",
            "nslookup",
            "metrics.fl-k8s-0111.svc.cluster.local",
          );
          return true;
        } catch {
          return false;
        }
      });
    },
    variants: [
      {
        name: "wrong selector — no endpoints",
        async run(k) {
          k.run("rollout", "status", "deployment/metrics", "-n", "fl-k8s-0111", "--timeout=60s");
          k.apply(`
apiVersion: v1
kind: Service
metadata:
  name: metrics
  namespace: fl-k8s-0111
spec:
  selector:
    app: wrong-label
  ports:
    - port: 80
      targetPort: 80
`);
        },
        failing: ["routes", "endpoints"],
      },
    ],
  },

  "k8s-0112": {
    initial: [["deployment", "db", "fl-k8s-0112"]],
    async solve(k) {
      k.apply(`
apiVersion: v1
kind: Service
metadata:
  name: db-headless
  namespace: fl-k8s-0112
spec:
  clusterIP: None
  selector:
    app: db
  ports:
    - port: 80
      targetPort: 80
`);
      k.run("rollout", "status", "deployment/db", "-n", "fl-k8s-0112", "--timeout=60s");
      await k.ready("grader-client", "fl-k8s-0112");
      await k.until("db-headless dns resolves", () => {
        try {
          k.run(
            "exec",
            "grader-client",
            "-n",
            "fl-k8s-0112",
            "--",
            "nslookup",
            "db-headless.fl-k8s-0112.svc.cluster.local",
          );
          return true;
        } catch {
          return false;
        }
      });
    },
    variants: [
      {
        name: "normal ClusterIP instead of headless",
        async run(k) {
          k.run("rollout", "status", "deployment/db", "-n", "fl-k8s-0112", "--timeout=60s");
          k.apply(`
apiVersion: v1
kind: Service
metadata:
  name: db-headless
  namespace: fl-k8s-0112
spec:
  selector:
    app: db
  ports:
    - port: 80
      targetPort: 80
`);
          await k.ready("grader-client", "fl-k8s-0112");
          await k.until("db-headless dns resolves", () => {
            try {
              k.run(
                "exec",
                "grader-client",
                "-n",
                "fl-k8s-0112",
                "--",
                "nslookup",
                "db-headless.fl-k8s-0112.svc.cluster.local",
              );
              return true;
            } catch {
              return false;
            }
          });
        },
        failing: ["headless-spec"],
      },
    ],
  },

  "k8s-0113": {
    initial: [],
    async solve(k) {
      k.apply(`
apiVersion: v1
kind: Service
metadata:
  name: external-api
  namespace: fl-k8s-0113
spec:
  type: ExternalName
  externalName: api.example.com
`);
    },
    variants: [
      {
        name: "wrong externalName target",
        async run(k) {
          k.apply(`
apiVersion: v1
kind: Service
metadata:
  name: external-api
  namespace: fl-k8s-0113
spec:
  type: ExternalName
  externalName: wrong.example.com
`);
        },
        failing: ["spec"],
      },
      {
        name: "ClusterIP instead of ExternalName",
        async run(k) {
          k.apply(`
apiVersion: v1
kind: Service
metadata:
  name: external-api
  namespace: fl-k8s-0113
spec:
  selector:
    app: api
  ports:
    - port: 80
`);
        },
        failing: ["spec"],
      },
    ],
  },
};
