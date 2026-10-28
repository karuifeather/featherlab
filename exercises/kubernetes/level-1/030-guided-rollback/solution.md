# Reference Solution

```bash
# Inspect the history
kubectl rollout history deployment/gateway -n fl-k8s-0030
kubectl rollout history deployment/gateway -n fl-k8s-0030 --revision=1

# Roll back to the previous (working) revision
kubectl rollout undo deployment/gateway -n fl-k8s-0030

# Verify
kubectl rollout status deployment/gateway -n fl-k8s-0030
kubectl get deployment gateway -n fl-k8s-0030 -o jsonpath='{.spec.template.spec.containers[0].image}'
```
