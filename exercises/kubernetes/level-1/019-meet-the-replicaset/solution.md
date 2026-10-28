# Reference Solution

```bash
# Inspect the Deployment and its ReplicaSets
kubectl get replicasets -n fl-k8s-0019
kubectl describe deployment catalog -n fl-k8s-0019

# Patch the Pod template to add tier=backend
kubectl patch deployment catalog -n fl-k8s-0019 \
  --type=merge \
  -p '{"spec":{"template":{"metadata":{"labels":{"tier":"backend"}}}}}'

# Confirm the rollout completes
kubectl rollout status deployment/catalog -n fl-k8s-0019
```

After the patch, a new ReplicaSet is created with the updated template hash. The old ReplicaSet scales down to 0 while the new one scales up to 2.
