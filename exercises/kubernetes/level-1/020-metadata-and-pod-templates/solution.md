# Reference Solution

```bash
# Inspect both label sections
kubectl get deployment frontend -n fl-k8s-0020 -o yaml | grep -A5 'metadata:'

# Patch the Pod template labels
kubectl patch deployment frontend -n fl-k8s-0020 \
  --type=merge \
  -p '{"spec":{"template":{"metadata":{"labels":{"env":"staging"}}}}}'

# Or edit directly
# kubectl edit deployment frontend -n fl-k8s-0020
# Add env: staging under spec.template.metadata.labels

kubectl rollout status deployment/frontend -n fl-k8s-0020
```
