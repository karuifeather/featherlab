A Deployment named `app-server` is running in namespace `fl-k8s-0094`. It has CPU requests set on its container, which is required for CPU-based autoscaling.

A HorizontalPodAutoscaler (HPA) watches a Deployment and adjusts its replica count based on observed metrics. When average CPU utilization across all pods rises above the target, the HPA scales out (adds replicas, up to `maxReplicas`). When it falls below, the HPA scales in (removes replicas, down to `minReplicas`).

**Note:** This cluster has no metrics-server installed. The HPA will show `<unknown>/80%` in `kubectl get hpa` — that is expected. The exercise grades the HPA's _configuration_, not live scaling behavior.

Your task:

Create a HorizontalPodAutoscaler named `app-server-hpa` in namespace `fl-k8s-0094` targeting Deployment `app-server` with these settings:

| Field                  | Value |
| ---------------------- | ----- |
| `minReplicas`          | `1`   |
| `maxReplicas`          | `5`   |
| Target CPU utilization | `80%` |

Reference: `kubectl explain horizontalpodautoscaler.spec`
