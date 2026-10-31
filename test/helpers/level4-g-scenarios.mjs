/**
 * Level 4 Circuit G scenarios: HPA and mastery (k8s-0094–0097).
 * k is a KubectlFacade with: k.run(...args) and k.apply(yaml).
 */

export const LEVEL4_G_SCENARIOS = {
  "k8s-0094": {
    initial: [["deployment", "app-server", "fl-k8s-0094"]],
    async solve(k) {
      k.run(
        "autoscale",
        "deployment",
        "app-server",
        "--cpu-percent=80",
        "--min=1",
        "--max=5",
        "--name=app-server-hpa",
        "-n",
        "fl-k8s-0094",
      );
    },
    variants: [
      {
        name: "wrong maxReplicas (10 instead of 5)",
        async run(k) {
          k.run(
            "autoscale",
            "deployment",
            "app-server",
            "--cpu-percent=80",
            "--min=1",
            "--max=10",
            "--name=app-server-hpa",
            "-n",
            "fl-k8s-0094",
          );
        },
        failing: ["config"],
      },
    ],
  },

  "k8s-0095": {
    initial: [["deployment", "web", "fl-k8s-0095"]],
    async solve(k) {
      k.run(
        "autoscale",
        "deployment",
        "web",
        "--cpu-percent=60",
        "--min=2",
        "--max=10",
        "--name=web-hpa",
        "-n",
        "fl-k8s-0095",
      );
    },
    variants: [
      {
        name: "wrong CPU percent (80 instead of 60)",
        async run(k) {
          k.run(
            "autoscale",
            "deployment",
            "web",
            "--cpu-percent=80",
            "--min=2",
            "--max=10",
            "--name=web-hpa",
            "-n",
            "fl-k8s-0095",
          );
        },
        failing: ["config"],
      },
    ],
  },

  "k8s-0096": {
    initial: [["deployment", "greedy-app", "fl-k8s-0096"]],
    async solve(k) {
      k.run(
        "set",
        "resources",
        "deployment",
        "greedy-app",
        "-c",
        "app",
        "--requests=cpu=200m,memory=64Mi",
        "--limits=cpu=500m,memory=128Mi",
        "-n",
        "fl-k8s-0096",
      );
      k.run("rollout", "status", "deployment/greedy-app", "-n", "fl-k8s-0096", "--timeout=180s");
    },
    variants: [
      {
        name: "requests fixed but CPU limit still too large",
        async run(k) {
          k.run(
            "set",
            "resources",
            "deployment",
            "greedy-app",
            "-c",
            "app",
            "--requests=cpu=200m,memory=64Mi",
            "--limits=cpu=5000m,memory=128Mi",
            "-n",
            "fl-k8s-0096",
          );
          k.run(
            "rollout",
            "status",
            "deployment/greedy-app",
            "-n",
            "fl-k8s-0096",
            "--timeout=180s",
          );
        },
        failing: ["resources"],
      },
    ],
  },

  "k8s-0097": {
    initial: [],
    async solve(k) {
      k.apply(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway
  namespace: fl-k8s-0097
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api-gateway
  template:
    metadata:
      labels:
        app: api-gateway
    spec:
      nodeSelector:
        kubernetes.io/os: linux
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
              - matchExpressions:
                  - key: kubernetes.io/arch
                    operator: In
                    values:
                      - amd64
      containers:
        - name: gateway
          image: nginx:1.27
          resources:
            requests:
              cpu: "100m"
              memory: "64Mi"
            limits:
              cpu: "300m"
              memory: "128Mi"
`);
      k.run("rollout", "status", "deployment/api-gateway", "-n", "fl-k8s-0097", "--timeout=180s");
    },
    variants: [
      {
        name: "nodeSelector omitted",
        async run(k) {
          k.apply(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway
  namespace: fl-k8s-0097
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api-gateway
  template:
    metadata:
      labels:
        app: api-gateway
    spec:
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
              - matchExpressions:
                  - key: kubernetes.io/arch
                    operator: In
                    values:
                      - amd64
      containers:
        - name: gateway
          image: nginx:1.27
          resources:
            requests:
              cpu: "100m"
              memory: "64Mi"
            limits:
              cpu: "300m"
              memory: "128Mi"
`);
          k.run(
            "rollout",
            "status",
            "deployment/api-gateway",
            "-n",
            "fl-k8s-0097",
            "--timeout=180s",
          );
        },
        failing: ["selector"],
      },
    ],
  },
};
