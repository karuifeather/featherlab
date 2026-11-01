/**
 * Level 5 Circuit A (remaining) and Circuit B scenarios: ClusterIP Services and EndpointSlices.
 * k is a KubectlFacade with: k.run(...args) and k.apply(yaml).
 */

export const LEVEL5_A_SCENARIOS = {
  "k8s-0098": {
    initial: [["deployment", "web", "fl-k8s-0098"]],
    async solve(k) {
      k.apply(`
apiVersion: v1
kind: Service
metadata:
  name: web
  namespace: fl-k8s-0098
spec:
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 80
`);
      k.run("rollout", "status", "deployment/web", "-n", "fl-k8s-0098", "--timeout=60s");
    },
    variants: [
      {
        name: "selector does not match deployment",
        async run(k) {
          k.run("rollout", "status", "deployment/web", "-n", "fl-k8s-0098", "--timeout=60s");
          k.apply(`
apiVersion: v1
kind: Service
metadata:
  name: web
  namespace: fl-k8s-0098
spec:
  selector:
    app: frontend
  ports:
    - port: 80
      targetPort: 80
`);
        },
        failing: ["routes"],
      },
    ],
  },
  "k8s-0099": {
    initial: [["deployment", "backend", "fl-k8s-0099"]],
    async solve(k) {
      k.apply(`
apiVersion: v1
kind: Service
metadata:
  name: backend
  namespace: fl-k8s-0099
spec:
  selector:
    app: backend
  ports:
    - port: 80
      targetPort: 80
`);
      k.run("rollout", "status", "deployment/backend", "-n", "fl-k8s-0099", "--timeout=60s");
      await k.ready("grader-client", "fl-k8s-0099");
      await k.until("backend service http responds", () => {
        try {
          k.run(
            "exec",
            "grader-client",
            "-n",
            "fl-k8s-0099",
            "--",
            "wget",
            "-qO-",
            "-T",
            "5",
            "http://backend.fl-k8s-0099:80/",
          );
          return true;
        } catch {
          return false;
        }
      });
    },
    variants: [
      {
        name: "wrong port",
        async run(k) {
          k.run("rollout", "status", "deployment/backend", "-n", "fl-k8s-0099", "--timeout=60s");
          k.apply(`
apiVersion: v1
kind: Service
metadata:
  name: backend
  namespace: fl-k8s-0099
spec:
  selector:
    app: backend
  ports:
    - port: 8080
      targetPort: 80
`);
        },
        failing: ["service-type", "http"],
      },
    ],
  },
  "k8s-0100": {
    initial: [["service", "api", "fl-k8s-0100"]],
    async solve(k) {
      k.replace(`
apiVersion: v1
kind: Service
metadata:
  name: api
  namespace: fl-k8s-0100
spec:
  selector:
    app: api
  ports:
    - port: 8080
      targetPort: 80
`);
      k.run("rollout", "status", "deployment/api", "-n", "fl-k8s-0100", "--timeout=60s");
    },
    variants: [
      {
        name: "port 80 instead of 8080",
        async run(k) {
          k.run("rollout", "status", "deployment/api", "-n", "fl-k8s-0100", "--timeout=60s");
          k.replace(`
apiVersion: v1
kind: Service
metadata:
  name: api
  namespace: fl-k8s-0100
spec:
  selector:
    app: api
  ports:
    - port: 80
      targetPort: 80
`);
        },
        failing: ["service-ports"],
      },
    ],
  },
  "k8s-0101": {
    initial: [],
    async solve(k) {
      k.apply(`
apiVersion: v1
kind: Service
metadata:
  name: catalog
  namespace: fl-k8s-0101
spec:
  selector:
    app: catalog
  ports:
    - port: 80
      targetPort: http
`);
      k.run("rollout", "status", "deployment/catalog", "-n", "fl-k8s-0101", "--timeout=60s");
    },
    variants: [
      {
        name: "targetPort number instead of named port",
        async run(k) {
          k.run("rollout", "status", "deployment/catalog", "-n", "fl-k8s-0101", "--timeout=60s");
          k.apply(`
apiVersion: v1
kind: Service
metadata:
  name: catalog
  namespace: fl-k8s-0101
spec:
  selector:
    app: catalog
  ports:
    - port: 80
      targetPort: 80
`);
        },
        failing: ["service-ports"],
      },
    ],
  },
  "k8s-0102": {
    initial: [["endpoints", "frontend", "fl-k8s-0102"]],
    async solve(k) {
      k.apply(`
apiVersion: v1
kind: Service
metadata:
  name: frontend
  namespace: fl-k8s-0102
spec:
  selector:
    app: frontend
  ports:
    - port: 80
      targetPort: 80
`);
      k.run("rollout", "status", "deployment/frontend", "-n", "fl-k8s-0102", "--timeout=60s");
    },
    variants: [
      {
        name: "selector still wrong (different typo)",
        async run(k) {
          k.run("rollout", "status", "deployment/frontend", "-n", "fl-k8s-0102", "--timeout=60s");
          k.apply(`
apiVersion: v1
kind: Service
metadata:
  name: frontend
  namespace: fl-k8s-0102
spec:
  selector:
    app: Frontend
  ports:
    - port: 80
      targetPort: 80
`);
        },
        failing: ["routes", "endpoints"],
      },
    ],
  },
  "k8s-0103": {
    initial: [],
    async solve(k) {
      k.apply(`
apiVersion: v1
kind: Service
metadata:
  name: auth
  namespace: fl-k8s-0103
spec:
  selector:
    app: auth
  ports:
    - port: 80
      targetPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: gateway
  namespace: fl-k8s-0103
spec:
  selector:
    app: gateway
  ports:
    - port: 8080
      targetPort: 80
`);
      k.run("rollout", "status", "deployment/auth", "-n", "fl-k8s-0103", "--timeout=60s");
      k.run("rollout", "status", "deployment/gateway", "-n", "fl-k8s-0103", "--timeout=60s");
    },
    variants: [
      {
        name: "gateway port 80 instead of 8080",
        async run(k) {
          k.run("rollout", "status", "deployment/auth", "-n", "fl-k8s-0103", "--timeout=60s");
          k.run("rollout", "status", "deployment/gateway", "-n", "fl-k8s-0103", "--timeout=60s");
          k.apply(`
apiVersion: v1
kind: Service
metadata:
  name: auth
  namespace: fl-k8s-0103
spec:
  selector:
    app: auth
  ports:
    - port: 80
      targetPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: gateway
  namespace: fl-k8s-0103
spec:
  selector:
    app: gateway
  ports:
    - port: 80
      targetPort: 80
`);
        },
        failing: ["service-gateway"],
      },
    ],
  },
};

export const LEVEL5_B_SCENARIOS = {
  "k8s-0104": {
    initial: [["deployment", "store", "fl-k8s-0104"]],
    async solve(k) {
      k.run("scale", "deployment", "store", "--replicas=2", "-n", "fl-k8s-0104");
      k.run("rollout", "status", "deployment/store", "-n", "fl-k8s-0104", "--timeout=120s");
    },
    variants: [
      {
        name: "only 1 replica",
        async run(k) {
          k.run("scale", "deployment", "store", "--replicas=1", "-n", "fl-k8s-0104");
          k.run("rollout", "status", "deployment/store", "-n", "fl-k8s-0104", "--timeout=120s");
        },
        failing: ["rollout", "endpoints"],
      },
    ],
  },
  "k8s-0105": {
    initial: [["deployment", "worker", "fl-k8s-0105"]],
    async solve(k) {
      k.run("scale", "deployment", "worker", "--replicas=3", "-n", "fl-k8s-0105");
      k.run("rollout", "status", "deployment/worker", "-n", "fl-k8s-0105", "--timeout=120s");
    },
    variants: [
      {
        name: "only 2 replicas",
        async run(k) {
          k.run("scale", "deployment", "worker", "--replicas=2", "-n", "fl-k8s-0105");
          k.run("rollout", "status", "deployment/worker", "-n", "fl-k8s-0105", "--timeout=120s");
        },
        failing: ["rollout", "endpoints"],
      },
    ],
  },
  "k8s-0106": {
    initial: [["deployment", "payments", "fl-k8s-0106"]],
    async solve(k) {
      k.apply(`
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payments
  namespace: fl-k8s-0106
spec:
  replicas: 3
  selector:
    matchLabels:
      app: payments
  template:
    metadata:
      labels:
        app: payments
    spec:
      terminationGracePeriodSeconds: 5
      containers:
        - name: nginx
          image: nginx:1.27
          ports:
            - containerPort: 80
          readinessProbe:
            httpGet:
              path: /
              port: 80
            initialDelaySeconds: 3
            periodSeconds: 5
`);
      k.run("rollout", "status", "deployment/payments", "-n", "fl-k8s-0106", "--timeout=120s");
    },
    variants: [
      {
        name: "readiness probe still on /ready",
        async run(k) {
          // Probe on /ready will fail. Wait for controller to observe the broken pods.
          await k.until("payments: broken probe observed", () => {
            const d = JSON.parse(
              k.run("get", "deployment", "payments", "-n", "fl-k8s-0106", "-o", "json"),
            );
            return (
              (d.status?.observedGeneration ?? 0) >= (d.metadata?.generation ?? 1) &&
              (d.status?.replicas ?? 0) > 0
            );
          });
        },
        failing: ["rollout", "endpoints"],
      },
    ],
  },
  "k8s-0107": {
    initial: [["endpoints", "reports", "fl-k8s-0107"]],
    async solve(k) {
      k.apply(`
apiVersion: v1
kind: Service
metadata:
  name: reports
  namespace: fl-k8s-0107
spec:
  selector:
    app: reports
  ports:
    - port: 80
      targetPort: 80
`);
      k.run("rollout", "status", "deployment/reports", "-n", "fl-k8s-0107", "--timeout=60s");
    },
    variants: [
      {
        name: "selector still has typo",
        async run(k) {
          k.run("rollout", "status", "deployment/reports", "-n", "fl-k8s-0107", "--timeout=60s");
          k.apply(`
apiVersion: v1
kind: Service
metadata:
  name: reports
  namespace: fl-k8s-0107
spec:
  selector:
    app: report
  ports:
    - port: 80
      targetPort: 80
`);
        },
        failing: ["routes", "endpoints"],
      },
    ],
  },
  "k8s-0108": {
    initial: [["service", "inventory", "fl-k8s-0108"]],
    async solve(k) {
      k.apply(`
apiVersion: v1
kind: Service
metadata:
  name: inventory
  namespace: fl-k8s-0108
spec:
  selector:
    app: inventory
  ports:
    - port: 9090
      targetPort: 80
`);
      k.run("rollout", "status", "deployment/inventory", "-n", "fl-k8s-0108", "--timeout=60s");
      await k.ready("grader-client", "fl-k8s-0108");
      await k.until("inventory service http responds", () => {
        try {
          k.run(
            "exec",
            "grader-client",
            "-n",
            "fl-k8s-0108",
            "--",
            "wget",
            "-qO-",
            "-T",
            "5",
            "http://inventory.fl-k8s-0108:9090/",
          );
          return true;
        } catch {
          return false;
        }
      });
    },
    variants: [
      {
        name: "targetPort still wrong",
        async run(k) {
          k.run("rollout", "status", "deployment/inventory", "-n", "fl-k8s-0108", "--timeout=60s");
          await k.ready("grader-client", "fl-k8s-0108");
          k.apply(`
apiVersion: v1
kind: Service
metadata:
  name: inventory
  namespace: fl-k8s-0108
spec:
  selector:
    app: inventory
  ports:
    - port: 9090
      targetPort: 9090
`);
        },
        failing: ["service-ports", "http"],
      },
    ],
  },
};
