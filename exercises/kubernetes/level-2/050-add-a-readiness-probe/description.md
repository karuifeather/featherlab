The `web` Deployment in `fl-k8s-0050` is running, but it has no readiness probe. Without one,
Kubernetes assumes the container is ready the moment it starts — before the server inside has
actually finished initialising. During a rolling update, that means traffic can reach a Pod that
is not yet able to respond, causing errors for your users.

A readiness probe gives Kubernetes a way to ask the container "are you ready?" before routing
traffic to it. Only Pods that pass the probe are added to the Service's endpoint list. If a Pod
fails the probe, Kubernetes quietly removes it from rotation without restarting it.

Add an HTTP readiness probe to the `web` container that checks path `/` on port `80`. Once the
probe is in place, a rolling update will wait for each new Pod to pass before moving on.
