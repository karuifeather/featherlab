Create the Deployment with an init container:

```bash
kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: fl-k8s-0057
spec:
  replicas: 1
  selector:
    matchLabels: { app: app }
  template:
    metadata:
      labels: { app: app }
    spec:
      initContainers:
        - name: setup
          image: busybox:1.36
          command: ["sh", "-c", "echo init done && sleep 1"]
      containers:
        - name: app
          image: nginx:1.27
EOF
```

Watch the rollout:

```bash
kubectl rollout status deployment/app -n fl-k8s-0057
```

The Pod first shows `Init:0/1` while `setup` runs, then moves to `Running` once nginx starts.
`kubectl describe pod <pod-name> -n fl-k8s-0057` shows the init container's output under
`Init Containers`.
