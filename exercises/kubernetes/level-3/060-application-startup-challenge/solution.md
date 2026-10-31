Create the Deployment with two init containers and a shared volume:

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

Watch the two init phases complete in order:

```bash
kubectl get pods -n fl-k8s-0060 --watch
# Init:0/2 -> Init:1/2 -> Init:2/2 -> Running
```

Then confirm the rollout:

```bash
kubectl rollout status deployment/platform -n fl-k8s-0060
```

The `db-check` container does not need to mount `config-vol` — it only echoes a message.
