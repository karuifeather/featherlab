/**
 * Level 4 Circuit E scenarios: node affinity and pod anti-affinity.
 * k is a KubectlFacade with: k.run(...args) and k.apply(yaml).
 */

export const LEVEL4_E_SCENARIOS = {
  "k8s-0090": {
    initial: [],
    async solve(k) {
      k.apply(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cache
  namespace: fl-k8s-0090
spec:
  replicas: 1
  selector:
    matchLabels:
      app: cache
  template:
    metadata:
      labels:
        app: cache
    spec:
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
              - matchExpressions:
                  - key: kubernetes.io/os
                    operator: In
                    values:
                      - linux
      containers:
        - name: app
          image: nginx:1.27
          resources:
            requests:
              cpu: "50m"
              memory: "32Mi"
`);
      k.run("rollout", "status", "deployment/cache", "-n", "fl-k8s-0090", "--timeout=120s");
    },
    variants: [
      {
        name: "preferred affinity instead of required",
        async run(k) {
          k.apply(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cache
  namespace: fl-k8s-0090
spec:
  replicas: 1
  selector:
    matchLabels:
      app: cache
  template:
    metadata:
      labels:
        app: cache
    spec:
      affinity:
        nodeAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 10
              preference:
                matchExpressions:
                  - key: kubernetes.io/os
                    operator: In
                    values:
                      - linux
      containers:
        - name: app
          image: nginx:1.27
          resources:
            requests:
              cpu: "50m"
              memory: "32Mi"
`);
          k.run("rollout", "status", "deployment/cache", "-n", "fl-k8s-0090", "--timeout=120s");
        },
        failing: ["affinity"],
      },
    ],
  },

  "k8s-0091": {
    initial: [],
    async solve(k) {
      k.apply(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: worker
  namespace: fl-k8s-0091
spec:
  replicas: 2
  selector:
    matchLabels:
      app: worker
  template:
    metadata:
      labels:
        app: worker
    spec:
      affinity:
        nodeAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 10
              preference:
                matchExpressions:
                  - key: kubernetes.io/arch
                    operator: In
                    values:
                      - amd64
      containers:
        - name: app
          image: nginx:1.27
          resources:
            requests:
              cpu: "50m"
              memory: "32Mi"
`);
      k.run("rollout", "status", "deployment/worker", "-n", "fl-k8s-0091", "--timeout=120s");
    },
    variants: [
      {
        name: "required affinity instead of preferred",
        async run(k) {
          k.apply(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: worker
  namespace: fl-k8s-0091
spec:
  replicas: 2
  selector:
    matchLabels:
      app: worker
  template:
    metadata:
      labels:
        app: worker
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
        - name: app
          image: nginx:1.27
          resources:
            requests:
              cpu: "50m"
              memory: "32Mi"
`);
          k.run("rollout", "status", "deployment/worker", "-n", "fl-k8s-0091", "--timeout=120s");
        },
        failing: ["affinity"],
      },
    ],
  },

  "k8s-0092": {
    initial: [],
    async solve(k) {
      k.apply(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: spread
  namespace: fl-k8s-0092
spec:
  replicas: 2
  selector:
    matchLabels:
      app: spread
  template:
    metadata:
      labels:
        app: spread
    spec:
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
              - matchExpressions:
                  - key: kubernetes.io/os
                    operator: In
                    values:
                      - linux
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                topologyKey: kubernetes.io/hostname
                labelSelector:
                  matchLabels:
                    app: spread
      containers:
        - name: app
          image: nginx:1.27
          resources:
            requests:
              cpu: "50m"
              memory: "32Mi"
`);
      k.run("rollout", "status", "deployment/spread", "-n", "fl-k8s-0092", "--timeout=120s");
    },
    variants: [
      {
        name: "missing node affinity (preferred only, wrong key)",
        async run(k) {
          k.apply(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: spread
  namespace: fl-k8s-0092
spec:
  replicas: 2
  selector:
    matchLabels:
      app: spread
  template:
    metadata:
      labels:
        app: spread
    spec:
      affinity:
        nodeAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 10
              preference:
                matchExpressions:
                  - key: kubernetes.io/os
                    operator: In
                    values:
                      - linux
        podAntiAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 100
              podAffinityTerm:
                topologyKey: kubernetes.io/hostname
                labelSelector:
                  matchLabels:
                    app: spread
      containers:
        - name: app
          image: nginx:1.27
          resources:
            requests:
              cpu: "50m"
              memory: "32Mi"
`);
          k.run("rollout", "status", "deployment/spread", "-n", "fl-k8s-0092", "--timeout=120s");
        },
        failing: ["affinity"],
      },
    ],
  },

  "k8s-0093": {
    initial: [["deployment", "blocked-app", "fl-k8s-0093"]],
    async solve(k) {
      k.run(
        "patch",
        "deployment",
        "blocked-app",
        "-n",
        "fl-k8s-0093",
        "--type=json",
        `-p=[{"op":"replace","path":"/spec/template/spec/affinity/nodeAffinity/requiredDuringSchedulingIgnoredDuringExecution/nodeSelectorTerms/0/matchExpressions/0","value":{"key":"kubernetes.io/os","operator":"In","values":["linux"]}}]`,
      );
      k.run("rollout", "status", "deployment/blocked-app", "-n", "fl-k8s-0093", "--timeout=120s");
    },
    variants: [
      {
        name: "affinity key changed but values still wrong",
        async run(k) {
          k.run(
            "patch",
            "deployment",
            "blocked-app",
            "-n",
            "fl-k8s-0093",
            "--type=json",
            `-p=[{"op":"replace","path":"/spec/template/spec/affinity/nodeAffinity/requiredDuringSchedulingIgnoredDuringExecution/nodeSelectorTerms/0/matchExpressions/0","value":{"key":"kubernetes.io/os","operator":"In","values":["windows"]}}]`,
          );
          // pod will stay Pending — no node has os=windows
        },
        failing: ["affinity", "rollout"],
      },
    ],
  },
};
