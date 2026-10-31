```bash
kubectl set resources deployment tracker -c app --requests=cpu=100m -n fl-k8s-0079
kubectl rollout status deployment/tracker -n fl-k8s-0079 --timeout=120s
```
