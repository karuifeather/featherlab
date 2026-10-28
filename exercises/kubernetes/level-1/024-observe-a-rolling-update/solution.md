# Reference Solution

```bash
# Trigger the rolling update
kubectl set image deployment/payment-api app=nginx:1.27-alpine -n fl-k8s-0024

# Watch rollout progress
kubectl rollout status deployment/payment-api -n fl-k8s-0024

# Observe ReplicaSets (old one scales to 0, new one scales to 3)
kubectl get replicasets -n fl-k8s-0024

# Verify
kubectl get deployment payment-api -n fl-k8s-0024
```
