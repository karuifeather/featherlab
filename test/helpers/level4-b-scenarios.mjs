/**
 * Level 4 Circuit B scenarios: QoS, ResourceQuota, LimitRange.
 */
export const LEVEL4_B_SCENARIOS = {
  "k8s-0082": {
    initial: [],
    async solve(k) {
      k.apply(`
apiVersion: v1
kind: Pod
metadata:
  name: qos-guaranteed
  namespace: fl-k8s-0082
spec:
  containers:
    - name: app
      image: busybox:1.36
      command: ["sh", "-c", "sleep 3600"]
      resources:
        requests:
          cpu: "100m"
          memory: "64Mi"
        limits:
          cpu: "100m"
          memory: "64Mi"
`);
      k.run(
        "wait",
        "pod/qos-guaranteed",
        "-n",
        "fl-k8s-0082",
        "--for=condition=Ready",
        "--timeout=120s",
      );
    },
    variants: [
      {
        name: "requests not equal to limits (Burstable, not Guaranteed)",
        async run(k) {
          k.apply(`
apiVersion: v1
kind: Pod
metadata:
  name: qos-guaranteed
  namespace: fl-k8s-0082
spec:
  containers:
    - name: app
      image: busybox:1.36
      command: ["sh", "-c", "sleep 3600"]
      resources:
        requests:
          cpu: "50m"
          memory: "32Mi"
        limits:
          cpu: "100m"
          memory: "64Mi"
`);
          k.run(
            "wait",
            "pod/qos-guaranteed",
            "-n",
            "fl-k8s-0082",
            "--for=condition=Ready",
            "--timeout=120s",
          );
        },
        failing: ["qos", "resources"],
      },
    ],
  },

  "k8s-0083": {
    initial: [["deployment", "existing-app", "fl-k8s-0083"]],
    async solve(k) {
      k.run(
        "create",
        "quota",
        "team-budget",
        "--hard=requests.cpu=500m,requests.memory=512Mi,limits.cpu=2,limits.memory=2Gi",
        "-n",
        "fl-k8s-0083",
      );
    },
    variants: [
      {
        name: "wrong requests.cpu value",
        async run(k) {
          k.run(
            "create",
            "quota",
            "team-budget",
            "--hard=requests.cpu=1,requests.memory=512Mi,limits.cpu=2,limits.memory=2Gi",
            "-n",
            "fl-k8s-0083",
          );
        },
        failing: ["limits"],
      },
    ],
  },

  "k8s-0084": {
    initial: [["deployment", "api", "fl-k8s-0084"]],
    async solve(k) {
      k.run(
        "set",
        "resources",
        "deployment",
        "api",
        "-c",
        "app",
        "--limits=cpu=150m,memory=256Mi",
        "-n",
        "fl-k8s-0084",
      );
      k.run("rollout", "status", "deployment/api", "-n", "fl-k8s-0084", "--timeout=180s");
    },
    variants: [
      {
        name: "CPU limit still exceeds quota (300m > 200m)",
        async run(k) {
          k.run(
            "set",
            "resources",
            "deployment",
            "api",
            "-c",
            "app",
            "--limits=cpu=300m,memory=256Mi",
            "-n",
            "fl-k8s-0084",
          );
          // pods won't create; rollout times out
        },
        failing: ["cpu-limit", "rollout"],
      },
    ],
  },

  "k8s-0085": {
    initial: [],
    async solve(k) {
      k.apply(`
apiVersion: v1
kind: LimitRange
metadata:
  name: default-limits
  namespace: fl-k8s-0085
spec:
  limits:
    - type: Container
      default:
        cpu: "200m"
        memory: "128Mi"
      defaultRequest:
        cpu: "100m"
        memory: "64Mi"
      max:
        cpu: "1"
`);
    },
    variants: [
      {
        name: "wrong default cpu value",
        async run(k) {
          k.apply(`
apiVersion: v1
kind: LimitRange
metadata:
  name: default-limits
  namespace: fl-k8s-0085
spec:
  limits:
    - type: Container
      default:
        cpu: "100m"
        memory: "128Mi"
      defaultRequest:
        cpu: "50m"
        memory: "64Mi"
      max:
        cpu: "1"
`);
        },
        failing: ["defaults"],
      },
    ],
  },

  "k8s-0086": {
    initial: [["deployment", "server", "fl-k8s-0086"]],
    async solve(k) {
      k.run(
        "set",
        "resources",
        "deployment",
        "server",
        "-c",
        "app",
        "--limits=cpu=400m,memory=200Mi",
        "-n",
        "fl-k8s-0086",
      );
      k.run("rollout", "status", "deployment/server", "-n", "fl-k8s-0086", "--timeout=180s");
    },
    variants: [
      {
        name: "CPU limit still exceeds LimitRange max",
        async run(k) {
          k.run(
            "set",
            "resources",
            "deployment",
            "server",
            "-c",
            "app",
            "--limits=cpu=600m,memory=200Mi",
            "-n",
            "fl-k8s-0086",
          );
          // pods won't admit
        },
        failing: ["resources", "rollout"],
      },
    ],
  },
};
