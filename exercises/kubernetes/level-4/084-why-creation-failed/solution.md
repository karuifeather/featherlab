```bash
# Diagnose: see the quota rejection event
kubectl get events -n fl-k8s-0084 | grep -i quota

# Fix: lower the CPU limit to fit within the 200m quota
kubectl set resources deployment api -c app \
  --limits=cpu=150m,memory=256Mi \
  -n fl-k8s-0084

# Confirm rollout
kubectl rollout status deployment/api -n fl-k8s-0084 --timeout=180s
```
