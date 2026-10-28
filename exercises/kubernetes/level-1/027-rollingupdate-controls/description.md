## Background

`maxSurge` and `maxUnavailable` control the speed and availability trade-off during a rolling update:

| Setting                               | Effect                                      |
| ------------------------------------- | ------------------------------------------- |
| High `maxSurge`, low `maxUnavailable` | Faster rollout, needs more cluster capacity |
| Low `maxSurge`, high `maxUnavailable` | Slower rollout, needs less extra capacity   |
| `maxSurge: 0, maxUnavailable: 1`      | Strictly serial; one Pod replaced at a time |

Both values accept **integers** (absolute Pod count) or **percentages** (`"25%"` of `replicas`).

Example: with `replicas: 4`, `maxSurge: 1`, `maxUnavailable: 1`, during a rolling update Kubernetes can run at most 5 Pods (4 + 1 surge) while at least 3 remain available (4 − 1 unavailable).

## Task

The `inventory` Deployment in `fl-k8s-0027` uses the default `RollingUpdate` parameters. Update it so that `maxSurge` is `1` and `maxUnavailable` is `1`.

```
kubectl get deployment inventory -n fl-k8s-0027 -o jsonpath='{.spec.strategy}'
```

Official documentation: [RollingUpdate Deployment](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#rolling-update-deployment)
