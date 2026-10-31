Real applications often need multiple setup steps before the main process is ready: loading config,
running a database check, or waiting for a dependency. Kubernetes runs init containers in order,
so each step can build on the one before it.

**Two init containers, one volume**

In this exercise you will create a Deployment with two init containers that run sequentially:

1. `config-loader` writes application config to a shared volume.
2. `db-check` simulates a readiness check (just echoes "db ok").
3. `app` (nginx) starts only after both init containers have exited 0.

Only `config-loader` and `app` need to share the volume — `db-check` does not need to write or
read from it.

**What you will do**

Create a Deployment named `platform` in `fl-k8s-0060` with:

```bash
kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: platform
  namespace: fl-k8s-0060
spec:
  replicas: 1
  selector:
    matchLabels: { app: platform }
  template:
    metadata:
      labels: { app: platform }
    spec:
      volumes:
        - name: config-vol
          emptyDir: {}
      initContainers:
        - name: config-loader
          image: busybox:1.36
          command: ["sh", "-c", "echo mode=production > /config/app.properties"]
          volumeMounts:
            - name: config-vol
              mountPath: /config
        - name: db-check
          image: busybox:1.36
          command: ["sh", "-c", "echo db ok"]
      containers:
        - name: app
          image: nginx:1.27
          volumeMounts:
            - name: config-vol
              mountPath: /etc/app
EOF
```

Watch the init containers run in sequence with `kubectl get pods -n fl-k8s-0060 --watch`.
