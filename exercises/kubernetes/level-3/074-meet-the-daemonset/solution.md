Apply the DaemonSet manifest:

```bash
kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: node-checker
  namespace: fl-k8s-0074
spec:
  selector:
    matchLabels:
      app: node-checker
  template:
    metadata:
      labels:
        app: node-checker
    spec:
      containers:
      - name: checker
        image: busybox:1.36
        command: ["sh", "-c", "while true; do echo checking; sleep 30; done"]
EOF
```

Wait for the DaemonSet to be ready:

```bash
kubectl rollout status daemonset/node-checker -n fl-k8s-0074 --timeout=120s
```

Verify:

```bash
kubectl get daemonset node-checker -n fl-k8s-0074
# NAME           DESIRED   CURRENT   READY   UP-TO-DATE   AVAILABLE
# node-checker   1         1         1       1            1
```

In the kind single-node cluster, `DESIRED=1` means one node is eligible. `READY=1` confirms the Pod is running and healthy.
