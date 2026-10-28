The `api` Deployment in `fl-k8s-0051` already has a readiness probe, so Kubernetes knows when
the container is accepting traffic. But readiness only controls routing — it does not restart a
container. If the process inside deadlocks or hangs permanently, the Pod stays "Running" and
"Ready" forever, silently breaking requests.

The readiness probe already handles traffic routing — if the container stops responding, it is
pulled from rotation. But pulled is not the same as restarted. The Pod stays Running and NotReady
indefinitely, occupying a replica slot without doing useful work. For a true deadlock, you need
something that triggers a restart.

A liveness probe does that. Kubernetes runs it continuously while the container is alive. If
the probe fails enough times in a row, the kubelet kills the container and restarts it, recovering
from states the application cannot escape on its own.

Add a TCP liveness probe to the `api` container on port `80`. TCP probes simply try to open a
connection; if the port accepts, the probe passes. They are a lightweight safety net for services
that do not expose a dedicated health endpoint.

As a bonus, keep in mind the sibling of both probes: the startup probe. It delays liveness and
readiness checks until a slow-starting container has had enough time to initialise — preventing
premature restarts during boot without giving up ongoing health monitoring.
