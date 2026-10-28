## Background

Kubernetes supports two Deployment update strategies:

| Strategy        | Behaviour during update                                                               |
| --------------- | ------------------------------------------------------------------------------------- |
| `Recreate`      | All existing Pods are deleted before new Pods are created. Brief downtime guaranteed. |
| `RollingUpdate` | Old and new Pods run simultaneously during the update. Zero downtime possible.        |

`RollingUpdate` has two tuning parameters:

| Parameter        | Meaning                                            | Default |
| ---------------- | -------------------------------------------------- | ------- |
| `maxSurge`       | Max Pods above desired replica count during update | `25%`   |
| `maxUnavailable` | Max Pods below desired replica count during update | `25%`   |

Setting `maxUnavailable: 0` ensures no existing Pod is removed until a new one is Ready — zero-downtime, at the cost of briefly needing extra capacity.

## Situation

The `billing` Deployment in `fl-k8s-0026` uses the `Recreate` strategy, which was safe during early development but is not acceptable for production. Switch it to `RollingUpdate` with `maxSurge: 1` and `maxUnavailable: 0`.

## Task

Inspect the current strategy:

```
kubectl get deployment billing -n fl-k8s-0026 -o yaml | grep -A5 strategy
```

Then update the strategy to `RollingUpdate` with `maxSurge: 1, maxUnavailable: 0`. Verify the rollout completes.

Official documentation: [Deployment Strategy](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#strategy)
