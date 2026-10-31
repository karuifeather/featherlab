A LimitRange named `ns-limits` and a Deployment named `server` have been created in namespace `fl-k8s-0086`. The Deployment object exists, but its pods cannot be admitted — they violate the LimitRange maximum.

The LimitRange enforces a ceiling on container resources. Pods whose containers exceed `max.cpu` or `max.memory` are rejected at admission, even if node capacity is available.

The LimitRange constraints are:

| Field            | cpu    | memory  |
| ---------------- | ------ | ------- |
| `max`            | `500m` | `256Mi` |
| `defaultRequest` | `50m`  | `32Mi`  |

The current Deployment template sets CPU limit `2` and memory limit `512Mi` — both exceed the LimitRange maximum.

Your task:

Repair container `app` of Deployment `server` so its CPU limit is `400m` and memory limit is `200Mi` (both within the LimitRange max). The Deployment must roll out with 1 available replica.

Reference: `kubectl get events -n fl-k8s-0086`, `kubectl describe limitrange ns-limits -n fl-k8s-0086`
