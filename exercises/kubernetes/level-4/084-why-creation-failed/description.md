A ResourceQuota named `tight-budget` and a Deployment named `api` have been created in namespace `fl-k8s-0084`. The Deployment object exists, but its pods are stuck — none have been scheduled.

ResourceQuota admission applies at Pod creation time, not at Deployment creation. The Deployment controller tries to create a ReplicaSet and then a Pod, but the Pod is rejected because its resource requirements exceed the namespace quota.

Investigate why the pods are not starting and fix the Deployment so it rolls out successfully.

The quota hard limits are:

| Field             | Value   |
| ----------------- | ------- |
| `requests.cpu`    | `100m`  |
| `requests.memory` | `128Mi` |
| `limits.cpu`      | `200m`  |
| `limits.memory`   | `256Mi` |

Your task:

Repair container `app` of Deployment `api` so its CPU limit is `150m` (within the quota). Keep the memory limit at `256Mi`. The Deployment must roll out with 1 available replica.

Reference: `kubectl get events -n fl-k8s-0084`, `kubectl describe rs -n fl-k8s-0084`
