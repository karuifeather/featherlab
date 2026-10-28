# Reference Solution

```bash
# Patch strategy
kubectl patch deployment billing -n fl-k8s-0026 \
  --type=merge \
  -p '{"spec":{"strategy":{"type":"RollingUpdate","rollingUpdate":{"maxSurge":1,"maxUnavailable":0}}}}'

# Verify
kubectl rollout status deployment/billing -n fl-k8s-0026
kubectl get deployment billing -n fl-k8s-0026 -o yaml | grep -A8 strategy
```
