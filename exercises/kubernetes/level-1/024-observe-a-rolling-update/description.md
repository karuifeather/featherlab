## Background

A **rolling update** replaces Pods gradually without taking the entire workload offline. As each new Pod becomes Ready, an old Pod is removed. The Deployment controller manages this using two ReplicaSets: the old one that scales down and the new one that scales up.

You can observe this in real time:

```
# In one terminal — watch the update
kubectl rollout status deployment/payment-api -n fl-k8s-0024

# In another terminal — watch ReplicaSets change
kubectl get replicasets -n fl-k8s-0024 -w
```

After the update completes, both ReplicaSets still exist. The old one stays at 0 replicas as a rollback target (subject to `revisionHistoryLimit`).

## Task

The `payment-api` Deployment in `fl-k8s-0024` runs `nginx:1.27` on 3 replicas. Update the `app` container to `nginx:1.27-alpine`. While the update is happening (or immediately after), check `kubectl get replicasets -n fl-k8s-0024` to observe how Kubernetes manages the transition. Confirm the rollout completes with all 3 replicas running the new image.

Official documentation: [Rolling Update Strategy](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#rolling-update-deployment), [kubectl rollout status](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_rollout/kubectl_rollout_status/)
