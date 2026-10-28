# Reference Solution

```bash
kubectl patch deployment inventory -n fl-k8s-0027 \
  --type=merge \
  -p '{"spec":{"strategy":{"rollingUpdate":{"maxSurge":1,"maxUnavailable":1}}}}'

kubectl rollout status deployment/inventory -n fl-k8s-0027
```
