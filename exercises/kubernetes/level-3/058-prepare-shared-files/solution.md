Create the Deployment with a shared emptyDir volume:

```bash
kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: fl-k8s-0058
spec:
  replicas: 1
  selector:
    matchLabels: { app: app }
  template:
    metadata:
      labels: { app: app }
    spec:
      volumes:
        - name: shared-data
          emptyDir: {}
      initContainers:
        - name: writer
          image: busybox:1.36
          command: ["sh", "-c", "echo 'hello from init' > /shared/index.html"]
          volumeMounts:
            - name: shared-data
              mountPath: /shared
      containers:
        - name: app
          image: nginx:1.27
          volumeMounts:
            - name: shared-data
              mountPath: /usr/share/nginx/html
EOF
```

Wait for the rollout:

```bash
kubectl rollout status deployment/app -n fl-k8s-0058
```

The init container runs first, writes the file, then exits. nginx then starts and serves the
file from the shared volume. The emptyDir exists for the lifetime of the Pod — if the Pod is
deleted, the data is gone.
