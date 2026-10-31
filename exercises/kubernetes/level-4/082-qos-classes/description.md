Kubernetes assigns a QoS (Quality of Service) class to every Pod based on how its containers declare resource requests and limits. There are three classes:

- **Guaranteed** — every container has CPU and memory requests exactly equal to their limits. These pods are evicted last under node pressure.
- **Burstable** — at least one container has a request or limit set, but they are not all equal.
- **BestEffort** — no container has any requests or limits set. These pods are evicted first.

Your task:

In namespace `fl-k8s-0082`, create a Pod named `qos-guaranteed` with a single container:

- Container name: `app`
- Image: `busybox:1.36`
- Command: `["sh", "-c", "sleep 3600"]`
- CPU request **and** limit: `100m`
- Memory request **and** limit: `64Mi`

The Pod must be Running and must have QoS class `Guaranteed`.

Reference: `kubectl explain pod.spec.containers.resources`
