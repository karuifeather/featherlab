# Reference Solution

```bash
# Update image
kubectl set image deployment/reports app=nginx:1.27-alpine -n fl-k8s-0028

# Annotate with change-cause (must match exactly what the grader checks)
kubectl annotate deployment reports -n fl-k8s-0028 \
  "kubernetes.io/change-cause=upgrade to nginx 1.27-alpine"

# Verify
kubectl rollout status deployment/reports -n fl-k8s-0028
kubectl rollout history deployment/reports -n fl-k8s-0028
```
