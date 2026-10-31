Some applications need to run setup tasks before the main process starts — fetching a config file,
pre-computing data, or checking that a dependency is reachable. Kubernetes handles this with
**init containers**.

**How init containers work**

Init containers are listed under `spec.initContainers[]` in the pod template. They run in order,
and each one must exit with code 0 before the next one starts. Only after all init containers
succeed does Kubernetes start the containers in `spec.containers[]`.

If an init container fails, Kubernetes retries it (with backoff) according to the pod's
`restartPolicy`. While waiting for init containers, the pod shows phases like
`Init:0/1` or `Init:CrashLoopBackOff`.

**What you will do**

Create a Deployment named `app` in `fl-k8s-0057` with:

- Init container `setup` using `busybox:1.36` that runs `sh -c 'echo init done && sleep 1'`
- Main container `app` using `nginx:1.27`

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

Watch the init phase complete with `kubectl get pods -n fl-k8s-0057 --watch`.
