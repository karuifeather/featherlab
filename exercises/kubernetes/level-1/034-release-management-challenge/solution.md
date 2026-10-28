# Reference Solution

```bash
# 1. Diagnose
kubectl get deployment platform -n fl-k8s-0034 -o yaml | grep -E 'paused:|image:'
kubectl rollout history deployment/platform -n fl-k8s-0034
kubectl rollout history deployment/platform -n fl-k8s-0034 --revision=2

# 2. Resume the Deployment first (rollback requires an active Deployment)
kubectl rollout resume deployment/platform -n fl-k8s-0034

# 3. Roll back to revision 2 (nginx:1.27-alpine — the last good image)
kubectl rollout undo deployment/platform -n fl-k8s-0034 --to-revision=2

# 4. Verify
kubectl rollout status deployment/platform -n fl-k8s-0034
kubectl get deployment platform -n fl-k8s-0034 -o jsonpath='{.spec.template.spec.containers[0].image}'
```
