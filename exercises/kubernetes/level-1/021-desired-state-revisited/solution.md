# Reference Solution

```bash
# Scale to 4 replicas
kubectl scale deployment orders -n fl-k8s-0021 --replicas=4

# Add the annotation to the Deployment (not the Pod template)
kubectl annotate deployment orders -n fl-k8s-0021 \
  featherlab.dev/scale-reason=high-availability

# Confirm the rollout
kubectl rollout status deployment/orders -n fl-k8s-0021

# Observe that only 1 revision exists (scaling did not create a new one)
kubectl rollout history deployment/orders -n fl-k8s-0021
```
