A Deployment named `web` is running in namespace `fl-k8s-0095` with 2 replicas. Its container has CPU requests defined.

The CPU utilization target on an HPA controls how aggressively it scales. A target of `60%` means the HPA tries to keep average CPU usage across all pods at 60% of their requests. It scales out when pods go above 60%, and scales in when they drop below — down to `minReplicas`.

Your task:

Create a HorizontalPodAutoscaler named `web-hpa` in namespace `fl-k8s-0095` targeting Deployment `web`:

| Field                  | Value |
| ---------------------- | ----- |
| `minReplicas`          | `2`   |
| `maxReplicas`          | `10`  |
| Target CPU utilization | `60%` |

Reference: `kubectl explain horizontalpodautoscaler.spec.metrics`
