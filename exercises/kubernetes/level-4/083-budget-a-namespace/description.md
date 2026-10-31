A Deployment named `existing-app` is already running in namespace `fl-k8s-0083`. It consumes `100m` CPU and `64Mi` memory (requests).

ResourceQuota limits the **total** resources that can be requested or consumed across all Pods in a namespace. It is enforced at admission time — existing Pods are not evicted, but new Pods that would push the namespace over the quota are rejected.

Your task:

Create a ResourceQuota named `team-budget` in namespace `fl-k8s-0083` with these hard limits:

| Field             | Value   |
| ----------------- | ------- |
| `requests.cpu`    | `500m`  |
| `requests.memory` | `512Mi` |
| `limits.cpu`      | `2`     |
| `limits.memory`   | `2Gi`   |

Reference: `kubectl explain resourcequota.spec.hard`
