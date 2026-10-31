A Deployment runs a configurable number of replicas. A DaemonSet runs exactly one Pod on each eligible node — no more, no less. When a new node joins the cluster, the DaemonSet controller schedules a Pod on it automatically. When a node leaves, its Pod is garbage-collected. This makes DaemonSets the right controller for node-local agents: log collectors, monitoring exporters, network plugins, and anything else that must run everywhere.

A DaemonSet manifest looks similar to a Deployment, with two important differences:

1. There is no `replicas` field — the count is determined by the number of eligible nodes
2. The `spec.selector.matchLabels` must match `spec.template.metadata.labels`

In a single-node kind cluster you will see `desired=1`. That is expected — one node means one Pod.

Your task: create a DaemonSet named `node-checker` in `fl-k8s-0074` using image `busybox:1.36` running `sh -c 'while true; do echo checking; sleep 30; done'`. Wait for it to be ready.
