A DaemonSet named `cluster-agent` is running in `fl-k8s-0076`. Before making any changes to this cluster, you need to understand how many Pods it has scheduled and confirm it is healthy.

The `kubectl get daemonset` output shows several columns that tell the story:

- `DESIRED` — how many nodes are eligible (no taints blocking the DaemonSet)
- `CURRENT` — how many Pods exist
- `READY` — how many Pods have passed their readiness checks
- `UP-TO-DATE` — how many Pods match the current template
- `AVAILABLE` — how many Pods are ready AND available for traffic

In a single-node kind cluster, `DESIRED=1`. That is normal: one node means one Pod.

`kubectl describe daemonset` shows more detail: the node selector, tolerations (which let the DaemonSet run on tainted nodes), and recent events.

Your task:

1. Use `kubectl get` and `kubectl describe` to inspect `cluster-agent`
2. Add label `observed: "yes"` to its metadata to record that you reviewed it
