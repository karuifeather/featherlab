Delete the wrong resources:

```bash
kubectl delete job web-server -n fl-k8s-0077
kubectl delete deployment batch-task node-monitor -n fl-k8s-0077
kubectl delete pod report-runner -n fl-k8s-0077
```

Create the correct resources:

```bash
# 1. Deployment for the web server
kubectl create deployment web-server --image=nginx:1.27 --replicas=2 -n fl-k8s-0077

# 2. Job for the batch task
kubectl create job batch-task --image=busybox:1.36 -n fl-k8s-0077 -- sh -c 'echo "batch done"'

# 3. DaemonSet for the node monitor
kubectl apply -f - -n fl-k8s-0077 <<'EOF'
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: node-monitor
  namespace: fl-k8s-0077
spec:
  selector:
    matchLabels:
      app: node-monitor
  template:
    metadata:
      labels:
        app: node-monitor
    spec:
      containers:
      - name: monitor
        image: busybox:1.36
        command: ["sh", "-c", "while true; do echo monitoring; sleep 30; done"]
EOF

# 4. CronJob for the report runner
kubectl create cronjob report-runner \
  --image=busybox:1.36 \
  --schedule='0 6 * * *' \
  --restart=Never \
  -n fl-k8s-0077 \
  -- sh -c 'echo report'
```

Wait for everything:

```bash
kubectl rollout status deployment/web-server -n fl-k8s-0077
kubectl wait --for=condition=complete job/batch-task -n fl-k8s-0077 --timeout=120s
kubectl rollout status daemonset/node-monitor -n fl-k8s-0077 --timeout=120s
```
