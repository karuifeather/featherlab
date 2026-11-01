/**
 * Level 5 Circuit D (Service Types) and Circuit E (Blue/Green) scenarios.
 * k is a KubectlFacade with: k.run(...args) and k.apply(yaml).
 */

export const LEVEL5_D_SCENARIOS = {
  "k8s-0114": {
    initial: [["deployment", "web", "fl-k8s-0114"]],
    async solve(k) {
      k.run(
        "expose",
        "deployment",
        "web",
        "--port=80",
        "--target-port=80",
        "--type=NodePort",
        "-n",
        "fl-k8s-0114",
      );
      k.run("rollout", "status", "deployment/web", "-n", "fl-k8s-0114", "--timeout=60s");
    },
    variants: [
      {
        name: "creates ClusterIP instead of NodePort",
        async run(k) {
          k.run("rollout", "status", "deployment/web", "-n", "fl-k8s-0114", "--timeout=60s");
          k.run(
            "expose",
            "deployment",
            "web",
            "--port=80",
            "--target-port=80",
            "-n",
            "fl-k8s-0114",
          );
        },
        failing: ["service-type"],
      },
      {
        name: "wrong targetPort",
        async run(k) {
          k.run("rollout", "status", "deployment/web", "-n", "fl-k8s-0114", "--timeout=60s");
          k.run(
            "expose",
            "deployment",
            "web",
            "--port=80",
            "--target-port=8080",
            "--type=NodePort",
            "-n",
            "fl-k8s-0114",
          );
        },
        failing: ["service-type"],
      },
    ],
  },

  "k8s-0115": {
    initial: [
      ["deployment", "api", "fl-k8s-0115"],
      ["service", "api", "fl-k8s-0115"],
      ["pod", "grader-client", "fl-k8s-0115"],
    ],
    async solve(k) {
      k.run(
        "patch",
        "svc",
        "api",
        "-n",
        "fl-k8s-0115",
        "--type=json",
        '-p=[{"op":"replace","path":"/spec/ports/0/targetPort","value":80}]',
      );
      k.run("rollout", "status", "deployment/api", "-n", "fl-k8s-0115", "--timeout=60s");
      await k.ready("grader-client", "fl-k8s-0115");
      await k.until("api http responds", () => {
        try {
          k.run(
            "exec",
            "grader-client",
            "-n",
            "fl-k8s-0115",
            "--",
            "wget",
            "-qO-",
            "-T",
            "5",
            "http://api.fl-k8s-0115:8080/",
          );
          return true;
        } catch {
          return false;
        }
      });
    },
    variants: [
      {
        name: "sets targetPort to 8080 instead of 80",
        async run(k) {
          k.run("rollout", "status", "deployment/api", "-n", "fl-k8s-0115", "--timeout=60s");
          k.run(
            "patch",
            "svc",
            "api",
            "-n",
            "fl-k8s-0115",
            "--type=json",
            '-p=[{"op":"replace","path":"/spec/ports/0/targetPort","value":8080}]',
          );
        },
        failing: ["service-type", "http"],
      },
      {
        name: "changes type to ClusterIP instead of fixing targetPort",
        async run(k) {
          k.run("rollout", "status", "deployment/api", "-n", "fl-k8s-0115", "--timeout=60s");
          k.apply(`
apiVersion: v1
kind: Service
metadata:
  name: api
  namespace: fl-k8s-0115
spec:
  type: ClusterIP
  selector:
    app: api
  ports:
    - port: 8080
      targetPort: 9090
`);
        },
        failing: ["service-type", "http"],
      },
    ],
  },
};

export const LEVEL5_E_SCENARIOS = {
  "k8s-0116": {
    initial: [
      ["deployment", "web-blue", "fl-k8s-0116"],
      ["deployment", "web-green", "fl-k8s-0116"],
      ["service", "web", "fl-k8s-0116"],
      ["pod", "grader-client", "fl-k8s-0116"],
    ],
    async solve(k) {
      k.run("scale", "deployment", "web-green", "--replicas=3", "-n", "fl-k8s-0116");
      k.run("rollout", "status", "deployment/web-green", "-n", "fl-k8s-0116", "--timeout=60s");
    },
    variants: [
      {
        name: "changes service selector to green while scaling",
        async run(k) {
          k.run("scale", "deployment", "web-green", "--replicas=3", "-n", "fl-k8s-0116");
          k.run("rollout", "status", "deployment/web-green", "-n", "fl-k8s-0116", "--timeout=60s");
          k.run(
            "patch",
            "svc",
            "web",
            "-n",
            "fl-k8s-0116",
            "--type=merge",
            '-p={"spec":{"selector":{"app":"web","version":"green"}}}',
          );
        },
        failing: ["service-still-blue", "routes-to-blue"],
      },
      {
        name: "scales web-green to 2 replicas instead of 3",
        async run(k) {
          k.run("scale", "deployment", "web-green", "--replicas=2", "-n", "fl-k8s-0116");
        },
        failing: ["green-scaled"],
      },
    ],
  },

  "k8s-0117": {
    initial: [
      ["deployment", "web-blue", "fl-k8s-0117"],
      ["deployment", "web-green", "fl-k8s-0117"],
      ["service", "web", "fl-k8s-0117"],
      ["pod", "grader-client", "fl-k8s-0117"],
    ],
    async solve(k) {
      k.run(
        "patch",
        "svc",
        "web",
        "-n",
        "fl-k8s-0117",
        "--type=merge",
        '-p={"spec":{"selector":{"app":"web","version":"green"}}}',
      );
      k.run("rollout", "status", "deployment/web-green", "-n", "fl-k8s-0117", "--timeout=60s");
      await k.ready("grader-client", "fl-k8s-0117");
      await k.until("web routes to green", () => {
        try {
          k.run(
            "exec",
            "grader-client",
            "-n",
            "fl-k8s-0117",
            "--",
            "wget",
            "-qO-",
            "-T",
            "5",
            "http://web.fl-k8s-0117:80/",
          );
          return true;
        } catch {
          return false;
        }
      });
    },
    variants: [
      {
        name: "switches selector but keeps app label only",
        async run(k) {
          k.run("rollout", "status", "deployment/web-green", "-n", "fl-k8s-0117", "--timeout=60s");
          await k.ready("grader-client", "fl-k8s-0117");
          // json replace (not merge) so only version:green is set — strips app:web
          k.run(
            "patch",
            "svc",
            "web",
            "-n",
            "fl-k8s-0117",
            "--type=json",
            '-p=[{"op":"replace","path":"/spec/selector","value":{"version":"green"}}]',
          );
          await k.until("web routes to green", () => {
            try {
              k.run(
                "exec",
                "grader-client",
                "-n",
                "fl-k8s-0117",
                "--",
                "wget",
                "-qO-",
                "-T",
                "5",
                "http://web.fl-k8s-0117:80/",
              );
              return true;
            } catch {
              return false;
            }
          });
        },
        failing: ["service-selector"],
      },
      {
        name: "does not switch — service still points to blue",
        async run(k) {
          k.run("rollout", "status", "deployment/web-blue", "-n", "fl-k8s-0117", "--timeout=60s");
          await k.ready("grader-client", "fl-k8s-0117");
          await k.until("web routes to blue", () => {
            try {
              k.run(
                "exec",
                "grader-client",
                "-n",
                "fl-k8s-0117",
                "--",
                "wget",
                "-qO-",
                "-T",
                "5",
                "http://web.fl-k8s-0117:80/",
              );
              return true;
            } catch {
              return false;
            }
          });
        },
        failing: ["service-selector", "routes-to-green"],
      },
    ],
  },

  "k8s-0118": {
    initial: [
      ["deployment", "web-blue", "fl-k8s-0118"],
      ["deployment", "web-green", "fl-k8s-0118"],
      ["service", "web", "fl-k8s-0118"],
      ["pod", "grader-client", "fl-k8s-0118"],
    ],
    async solve(k) {
      k.run(
        "patch",
        "svc",
        "web",
        "-n",
        "fl-k8s-0118",
        "--type=merge",
        '-p={"spec":{"selector":{"app":"web","version":"blue"}}}',
      );
      k.run("rollout", "status", "deployment/web-blue", "-n", "fl-k8s-0118", "--timeout=60s");
      await k.ready("grader-client", "fl-k8s-0118");
      await k.until("web routes to blue", () => {
        try {
          k.run(
            "exec",
            "grader-client",
            "-n",
            "fl-k8s-0118",
            "--",
            "wget",
            "-qO-",
            "-T",
            "5",
            "http://web.fl-k8s-0118:80/",
          );
          return true;
        } catch {
          return false;
        }
      });
    },
    variants: [
      {
        name: "leaves service pointing to green",
        async run(k) {
          k.run("rollout", "status", "deployment/web-green", "-n", "fl-k8s-0118", "--timeout=60s");
          await k.ready("grader-client", "fl-k8s-0118");
          await k.until("web routes to green", () => {
            try {
              k.run(
                "exec",
                "grader-client",
                "-n",
                "fl-k8s-0118",
                "--",
                "wget",
                "-qO-",
                "-T",
                "5",
                "http://web.fl-k8s-0118:80/",
              );
              return true;
            } catch {
              return false;
            }
          });
        },
        failing: ["service-selector", "routes-to-blue", "endpoints-ready"],
      },
    ],
  },

  "k8s-0119": {
    initial: [
      ["deployment", "web-blue", "fl-k8s-0119"],
      ["deployment", "web-green", "fl-k8s-0119"],
      ["service", "web", "fl-k8s-0119"],
      ["pod", "grader-client", "fl-k8s-0119"],
    ],
    async solve(k) {
      k.run(
        "patch",
        "svc",
        "web",
        "-n",
        "fl-k8s-0119",
        "--type=merge",
        '-p={"spec":{"selector":{"app":"web","version":"blue"}}}',
      );
      k.run("rollout", "status", "deployment/web-blue", "-n", "fl-k8s-0119", "--timeout=60s");
      await k.ready("grader-client", "fl-k8s-0119");
      await k.until("web routes to blue", () => {
        try {
          k.run(
            "exec",
            "grader-client",
            "-n",
            "fl-k8s-0119",
            "--",
            "wget",
            "-qO-",
            "-T",
            "5",
            "http://web.fl-k8s-0119:80/",
          );
          return true;
        } catch {
          return false;
        }
      });
    },
    variants: [
      {
        name: "deletes web-green instead of preserving it",
        async run(k) {
          k.run(
            "patch",
            "svc",
            "web",
            "-n",
            "fl-k8s-0119",
            "--type=merge",
            '-p={"spec":{"selector":{"app":"web","version":"blue"}}}',
          );
          k.run("delete", "deployment", "web-green", "-n", "fl-k8s-0119");
          k.run("rollout", "status", "deployment/web-blue", "-n", "fl-k8s-0119", "--timeout=60s");
          await k.ready("grader-client", "fl-k8s-0119");
          await k.until("web routes to blue", () => {
            try {
              k.run(
                "exec",
                "grader-client",
                "-n",
                "fl-k8s-0119",
                "--",
                "wget",
                "-qO-",
                "-T",
                "5",
                "http://web.fl-k8s-0119:80/",
              );
              return true;
            } catch {
              return false;
            }
          });
        },
        failing: ["green-preserved"],
      },
      {
        name: "does not switch service back to blue",
        async run() {
          // no-op: service stays at broken green (nginx:1.27.99 ImagePullBackOff)
        },
        failing: ["service-selector", "routes-to-blue", "endpoints-ready", "http"],
      },
    ],
  },
};
