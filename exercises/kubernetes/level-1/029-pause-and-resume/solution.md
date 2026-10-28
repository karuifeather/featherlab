# Reference Solution

```bash
# Verify it's paused
kubectl get deployment search -n fl-k8s-0029 -o jsonpath='{.spec.paused}'

# Apply both changes while paused (no rollout starts yet)
kubectl set image deployment/search app=nginx:1.27-alpine -n fl-k8s-0029
kubectl scale deployment search -n fl-k8s-0029 --replicas=3

# Resume — both changes roll out together
kubectl rollout resume deployment/search -n fl-k8s-0029
kubectl rollout status deployment/search -n fl-k8s-0029
```
