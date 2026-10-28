## Background

`kubectl rollout pause` freezes a Deployment's rollout controller. You can make multiple changes (image, replicas, environment variables) while paused — none of them trigger a rollout. When you `resume`, all pending changes are applied in a single rollout, keeping a clean revision history.

```
kubectl rollout pause deployment/<name> -n <namespace>
# ... make changes ...
kubectl rollout resume deployment/<name> -n <namespace>
```

Pausing is useful for batching related changes into one revision rather than creating one revision per change.

## Situation

The `search` Deployment in `fl-k8s-0029` is currently paused — you can verify this with `kubectl get deployment search -n fl-k8s-0029 -o jsonpath='{.spec.paused}'`. While it is paused, apply the following updates, then resume the rollout:

1. Change the `app` container image to `nginx:1.27-alpine`.
2. Scale the Deployment to **3 replicas**.

Official documentation: [Pausing and Resuming a Deployment](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#pausing-and-resuming-a-deployment)
