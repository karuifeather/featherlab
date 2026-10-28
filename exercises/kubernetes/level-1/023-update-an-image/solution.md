# Reference Solution

```bash
# Update the container image
kubectl set image deployment/storefront web=nginx:1.27-alpine -n fl-k8s-0023

# Watch the rolling update
kubectl rollout status deployment/storefront -n fl-k8s-0023

# Verify
kubectl get deployment storefront -n fl-k8s-0023 -o jsonpath='{.spec.template.spec.containers[0].image}'
```
