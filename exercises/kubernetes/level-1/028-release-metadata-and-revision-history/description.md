## Background

`kubectl rollout history` shows revisions for a Deployment. Each revision maps to a ReplicaSet and records the CHANGE-CAUSE if the `kubernetes.io/change-cause` annotation is set:

```
kubectl rollout history deployment/reports -n fl-k8s-0028
# REVISION  CHANGE-CAUSE
# 1         initial deploy nginx:1.27
# 2         upgrade to nginx 1.27-alpine
```

The annotation must be on the **Deployment object** (not the Pod template) before or after the rollout. Teams use this to maintain an audit trail of changes without needing to look up git history.

## Task

1. Update the `reports` Deployment's `app` container image to `nginx:1.27-alpine`.
2. Set the `kubernetes.io/change-cause` annotation to `upgrade to nginx 1.27-alpine`.
3. Confirm the rollout completes and check `kubectl rollout history` to verify the annotation appears in the latest revision.

Official documentation: [Rollout History](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#checking-rollout-history-of-a-deployment)
