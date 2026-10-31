/**
 * Level 4 Circuit A scenarios: resource requests and limits.
 * k is a KubectlFacade with: k.run(...args) and k.apply(yaml).
 */

export const LEVEL4_A_SCENARIOS = {
  "k8s-0079": {
    initial: [["deployment", "tracker", "fl-k8s-0079"]],
    async solve(k) {
      k.run(
        "set",
        "resources",
        "deployment",
        "tracker",
        "-c",
        "app",
        "--requests=cpu=100m",
        "-n",
        "fl-k8s-0079",
      );
      k.run("rollout", "status", "deployment/tracker", "-n", "fl-k8s-0079", "--timeout=120s");
    },
    variants: [
      {
        name: "memory request instead of CPU request",
        async run(k) {
          k.run(
            "set",
            "resources",
            "deployment",
            "tracker",
            "-c",
            "app",
            "--requests=memory=64Mi",
            "-n",
            "fl-k8s-0079",
          );
          k.run("rollout", "status", "deployment/tracker", "-n", "fl-k8s-0079", "--timeout=120s");
        },
        failing: ["cpu-request"],
      },
    ],
  },
  "k8s-0080": {
    initial: [],
    async solve(k) {
      k.apply(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: logger
  namespace: fl-k8s-0080
spec:
  replicas: 1
  selector:
    matchLabels:
      app: logger
  template:
    metadata:
      labels:
        app: logger
    spec:
      containers:
        - name: main
          image: busybox:1.36
          command: ["sh", "-c", "sleep 3600"]
          resources:
            requests:
              cpu: "200m"
              memory: "128Mi"
            limits:
              cpu: "500m"
              memory: "256Mi"
`);
      k.run("rollout", "status", "deployment/logger", "-n", "fl-k8s-0080", "--timeout=120s");
    },
    variants: [
      {
        name: "requests only — no limits",
        async run(k) {
          k.apply(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: logger
  namespace: fl-k8s-0080
spec:
  replicas: 1
  selector:
    matchLabels:
      app: logger
  template:
    metadata:
      labels:
        app: logger
    spec:
      containers:
        - name: main
          image: busybox:1.36
          command: ["sh", "-c", "sleep 3600"]
          resources:
            requests:
              cpu: "200m"
              memory: "128Mi"
`);
          k.run("rollout", "status", "deployment/logger", "-n", "fl-k8s-0080", "--timeout=120s");
        },
        failing: ["resources"],
      },
    ],
  },
  "k8s-0081": {
    initial: [["deployment", "proxy", "fl-k8s-0081"]],
    async solve(k) {
      k.run(
        "set",
        "resources",
        "deployment",
        "proxy",
        "-c",
        "gateway",
        "--requests=cpu=150m",
        "--limits=memory=96Mi",
        "-n",
        "fl-k8s-0081",
      );
      k.run("rollout", "status", "deployment/proxy", "-n", "fl-k8s-0081", "--timeout=120s");
    },
    variants: [
      {
        name: "changes sidecar instead of gateway",
        async run(k) {
          k.run(
            "set",
            "resources",
            "deployment",
            "proxy",
            "-c",
            "sidecar",
            "--requests=cpu=30m",
            "--limits=memory=96Mi",
            "-n",
            "fl-k8s-0081",
          );
          k.run("rollout", "status", "deployment/proxy", "-n", "fl-k8s-0081", "--timeout=120s");
        },
        failing: ["gateway-resources", "sidecar-unchanged"],
      },
    ],
  },
};
