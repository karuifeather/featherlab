/**
 * Level 4 Circuit C scenarios: node inspection and placement.
 * k is a KubectlFacade with: k.run(...args) and k.apply(yaml).
 */

export const LEVEL4_C_SCENARIOS = {
  "k8s-0087": {
    initial: [["deployment", "beacon", "fl-k8s-0087"]],
    async solve(k) {
      k.run(
        "patch",
        "deployment",
        "beacon",
        "-n",
        "fl-k8s-0087",
        "--type=merge",
        '-p={"spec":{"template":{"spec":{"nodeSelector":{"kubernetes.io/os":"linux"}}}}}',
      );
      k.run("rollout", "status", "deployment/beacon", "-n", "fl-k8s-0087", "--timeout=120s");
    },
    variants: [
      {
        name: "wrong OS label value",
        async run(k) {
          k.run(
            "patch",
            "deployment",
            "beacon",
            "-n",
            "fl-k8s-0087",
            "--type=merge",
            '-p={"spec":{"template":{"spec":{"nodeSelector":{"kubernetes.io/os":"windows"}}}}}',
          );
        },
        failing: ["selector", "rollout"],
      },
    ],
  },

  "k8s-0088": {
    initial: [],
    async solve(k) {
      k.apply(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: scanner
  namespace: fl-k8s-0088
spec:
  replicas: 2
  selector:
    matchLabels:
      app: scanner
  template:
    metadata:
      labels:
        app: scanner
    spec:
      nodeSelector:
        kubernetes.io/arch: amd64
      containers:
        - name: app
          image: nginx:1.27
          resources:
            requests:
              cpu: "50m"
              memory: "32Mi"
`);
      k.run("rollout", "status", "deployment/scanner", "-n", "fl-k8s-0088", "--timeout=120s");
    },
    variants: [
      {
        name: "correct selector but only 1 replica",
        async run(k) {
          k.apply(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: scanner
  namespace: fl-k8s-0088
spec:
  replicas: 1
  selector:
    matchLabels:
      app: scanner
  template:
    metadata:
      labels:
        app: scanner
    spec:
      nodeSelector:
        kubernetes.io/arch: amd64
      containers:
        - name: app
          image: nginx:1.27
          resources:
            requests:
              cpu: "50m"
              memory: "32Mi"
`);
          k.run("rollout", "status", "deployment/scanner", "-n", "fl-k8s-0088", "--timeout=120s");
        },
        failing: ["rollout"],
      },
    ],
  },

  "k8s-0089": {
    initial: [["deployment", "stuck-app", "fl-k8s-0089"]],
    async solve(k) {
      k.run(
        "patch",
        "deployment",
        "stuck-app",
        "-n",
        "fl-k8s-0089",
        "--type=merge",
        '-p={"spec":{"template":{"spec":{"nodeSelector":{"kubernetes.io/os":"linux"}}}}}',
      );
      k.run("rollout", "status", "deployment/stuck-app", "-n", "fl-k8s-0089", "--timeout=120s");
    },
    variants: [
      {
        name: "nodeSelector removed entirely (no selector at all)",
        async run(k) {
          k.run(
            "patch",
            "deployment",
            "stuck-app",
            "-n",
            "fl-k8s-0089",
            "--type=json",
            '-p=[{"op":"remove","path":"/spec/template/spec/nodeSelector"}]',
          );
          k.run("rollout", "status", "deployment/stuck-app", "-n", "fl-k8s-0089", "--timeout=120s");
        },
        failing: ["selector"],
      },
    ],
  },
};
