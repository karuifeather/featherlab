```bash
# Diagnose: see the LimitRange violation event
kubectl get events -n fl-k8s-0086

# Fix: set limits within the LimitRange max (500m CPU, 256Mi memory)
kubectl set resources deployment server -c app \
  --limits=cpu=400m,memory=200Mi \
  -n fl-k8s-0086

# Confirm rollout
kubectl rollout status deployment/server -n fl-k8s-0086 --timeout=180s
```
