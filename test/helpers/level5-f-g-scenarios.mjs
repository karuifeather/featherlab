/**
 * Level 5 Circuit F+G scenarios: canary traffic and DNS troubleshooting.
 * k is a KubectlFacade with: k.run(...args) and k.apply(yaml).
 */

export const LEVEL5_F_SCENARIOS = {
  "k8s-0120": {
    initial: [
      ["deployment", "checkout-stable", "fl-k8s-0120"],
      ["service", "checkout", "fl-k8s-0120"],
    ],
    async solve(k) {
      k.apply(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkout-canary
  namespace: fl-k8s-0120
  labels:
    app: checkout
    version: canary
spec:
  replicas: 1
  selector:
    matchLabels:
      app: checkout
      version: canary
  template:
    metadata:
      labels:
        app: checkout
        version: canary
    spec:
      terminationGracePeriodSeconds: 5
      containers:
        - name: nginx
          image: nginx:1.27
          ports:
            - containerPort: 80
`);
      k.run(
        "rollout",
        "status",
        "deployment/checkout-stable",
        "-n",
        "fl-k8s-0120",
        "--timeout=60s",
      );
      k.run(
        "rollout",
        "status",
        "deployment/checkout-canary",
        "-n",
        "fl-k8s-0120",
        "--timeout=120s",
      );
    },
    variants: [
      {
        name: "canary with version label in service selector",
        async run(k) {
          k.apply(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkout-canary
  namespace: fl-k8s-0120
  labels:
    app: checkout
    version: canary
spec:
  replicas: 1
  selector:
    matchLabels:
      app: checkout
      version: canary
  template:
    metadata:
      labels:
        app: checkout
        version: canary
    spec:
      terminationGracePeriodSeconds: 5
      containers:
        - name: nginx
          image: nginx:1.27
`);
          k.run(
            "patch",
            "svc",
            "checkout",
            "-n",
            "fl-k8s-0120",
            "--type=merge",
            "-p",
            '{"spec":{"selector":{"app":"checkout","version":"canary"}}}',
          );
          k.run(
            "rollout",
            "status",
            "deployment/checkout-stable",
            "-n",
            "fl-k8s-0120",
            "--timeout=60s",
          );
          k.run(
            "rollout",
            "status",
            "deployment/checkout-canary",
            "-n",
            "fl-k8s-0120",
            "--timeout=60s",
          );
        },
        failing: ["endpoints"],
      },
    ],
  },

  "k8s-0121": {
    initial: [
      ["deployment", "app-stable", "fl-k8s-0121"],
      ["deployment", "app-canary", "fl-k8s-0121"],
      ["service", "myapp", "fl-k8s-0121"],
    ],
    async solve(k) {
      k.run("rollout", "status", "deployment/app-stable", "-n", "fl-k8s-0121", "--timeout=120s");
      k.run("rollout", "status", "deployment/app-canary", "-n", "fl-k8s-0121", "--timeout=120s");
      await k.ready("grader-client", "fl-k8s-0121");
      await k.until("myapp http responds", () => {
        try {
          k.run(
            "exec",
            "grader-client",
            "-n",
            "fl-k8s-0121",
            "--",
            "wget",
            "-qO-",
            "-T",
            "5",
            "http://myapp.fl-k8s-0121:80/",
          );
          return true;
        } catch {
          return false;
        }
      });
    },
    variants: [],
  },

  "k8s-0122": {
    initial: [
      ["deployment", "api-stable", "fl-k8s-0122"],
      ["deployment", "api-canary", "fl-k8s-0122"],
      ["service", "api", "fl-k8s-0122"],
    ],
    async solve(k) {
      k.run("delete", "deployment", "api-canary", "-n", "fl-k8s-0122");
      k.run("rollout", "status", "deployment/api-stable", "-n", "fl-k8s-0122", "--timeout=120s");
      await k.ready("grader-client", "fl-k8s-0122");
      await k.until("api http responds", () => {
        try {
          k.run(
            "exec",
            "grader-client",
            "-n",
            "fl-k8s-0122",
            "--",
            "wget",
            "-qO-",
            "-T",
            "5",
            "http://api.fl-k8s-0122:80/",
          );
          return true;
        } catch {
          return false;
        }
      });
    },
    variants: [
      {
        name: "scale canary to 0 instead of deleting",
        async run(k) {
          k.run("scale", "deployment", "api-canary", "--replicas=0", "-n", "fl-k8s-0122");
          k.run(
            "rollout",
            "status",
            "deployment/api-stable",
            "-n",
            "fl-k8s-0122",
            "--timeout=120s",
          );
          await k.ready("grader-client", "fl-k8s-0122");
          await k.until("api http responds", () => {
            try {
              k.run(
                "exec",
                "grader-client",
                "-n",
                "fl-k8s-0122",
                "--",
                "wget",
                "-qO-",
                "-T",
                "5",
                "http://api.fl-k8s-0122:80/",
              );
              return true;
            } catch {
              return false;
            }
          });
        },
        failing: ["canary-gone"],
      },
    ],
  },
};

export const LEVEL5_G_SCENARIOS = {
  "k8s-0123": {
    initial: [
      ["deployment", "search", "fl-k8s-0123-svc"],
      ["service", "search", "fl-k8s-0123-svc"],
    ],
    async solve(k) {
      k.run("rollout", "status", "deployment/search", "-n", "fl-k8s-0123-svc", "--timeout=120s");
      await k.ready("grader-client", "fl-k8s-0123");
      await k.until("search dns resolves", () => {
        try {
          k.run(
            "exec",
            "grader-client",
            "-n",
            "fl-k8s-0123",
            "--",
            "nslookup",
            "search.fl-k8s-0123-svc.svc.cluster.local",
          );
          return true;
        } catch {
          return false;
        }
      });
      await k.until("search http responds", () => {
        try {
          k.run(
            "exec",
            "grader-client",
            "-n",
            "fl-k8s-0123",
            "--",
            "wget",
            "-qO-",
            "-T",
            "5",
            "http://search.fl-k8s-0123-svc:80/",
          );
          return true;
        } catch {
          return false;
        }
      });
    },
    variants: [],
  },

  "k8s-0124": {
    initial: [
      ["deployment", "web", "fl-k8s-0124"],
      ["deployment", "web-canary", "fl-k8s-0124"],
      ["service", "web", "fl-k8s-0124"],
      ["deployment", "db", "fl-k8s-0124-data"],
      ["service", "db", "fl-k8s-0124-data"],
    ],
    async solve(k) {
      k.run(
        "patch",
        "svc",
        "db",
        "-n",
        "fl-k8s-0124-data",
        "--type=merge",
        "-p",
        '{"spec":{"selector":{"app":"db"}}}',
      );
      k.run("scale", "deployment", "web-canary", "--replicas=1", "-n", "fl-k8s-0124");
      k.run("rollout", "status", "deployment/web-canary", "-n", "fl-k8s-0124", "--timeout=120s");
      k.run("rollout", "status", "deployment/db", "-n", "fl-k8s-0124-data", "--timeout=60s");
      await k.ready("grader-client", "fl-k8s-0124");
      await k.until("web http responds", () => {
        try {
          k.run(
            "exec",
            "grader-client",
            "-n",
            "fl-k8s-0124",
            "--",
            "wget",
            "-qO-",
            "-T",
            "5",
            "http://web.fl-k8s-0124:80/",
          );
          return true;
        } catch {
          return false;
        }
      });
    },
    variants: [
      {
        name: "fix selector but forget to scale canary",
        async run(k) {
          k.run(
            "patch",
            "svc",
            "db",
            "-n",
            "fl-k8s-0124-data",
            "--type=merge",
            "-p",
            '{"spec":{"selector":{"app":"db"}}}',
          );
          k.run("rollout", "status", "deployment/db", "-n", "fl-k8s-0124-data", "--timeout=60s");
          await k.ready("grader-client", "fl-k8s-0124");
          await k.until("web http responds", () => {
            try {
              k.run(
                "exec",
                "grader-client",
                "-n",
                "fl-k8s-0124",
                "--",
                "wget",
                "-qO-",
                "-T",
                "5",
                "http://web.fl-k8s-0124:80/",
              );
              return true;
            } catch {
              return false;
            }
          });
        },
        failing: ["canary-ready", "web-endpoints"],
      },
      {
        name: "scale canary but leave broken db selector",
        async run(k) {
          k.run("scale", "deployment", "web-canary", "--replicas=1", "-n", "fl-k8s-0124");
          k.run(
            "rollout",
            "status",
            "deployment/web-canary",
            "-n",
            "fl-k8s-0124",
            "--timeout=120s",
          );
          await k.ready("grader-client", "fl-k8s-0124");
          await k.until("web http responds", () => {
            try {
              k.run(
                "exec",
                "grader-client",
                "-n",
                "fl-k8s-0124",
                "--",
                "wget",
                "-qO-",
                "-T",
                "5",
                "http://web.fl-k8s-0124:80/",
              );
              return true;
            } catch {
              return false;
            }
          });
        },
        failing: ["db-selects", "db-endpoints"],
      },
    ],
  },
};
