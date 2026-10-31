A DaemonSet named `log-forwarder` is already running in `fl-k8s-0075`. The platform team wants to tag all monitoring-related workloads with a `tier: monitoring` label on the resource metadata, so they can be identified and queried consistently across the cluster.

Labels on DaemonSet metadata (the outer `metadata.labels`) are properties of the DaemonSet object itself — they do not affect the Pod template or trigger a rolling update. This is different from labels on `spec.template.metadata.labels`, which affect Pod selection and do trigger rollouts when changed.

Your task: add the label `tier: monitoring` to the `log-forwarder` DaemonSet's metadata, then verify the DaemonSet is still ready.
