The `gateway` Deployment in `fl-k8s-0008` was given a new nginx configuration this morning.
Since then its containers start, die within a second, and start again. Kubernetes is doing its
job (restarting them, with growing back-off delays) but the service never comes up.

Find out why the program exits, fix the cause, and get both replicas Ready. The configuration
lives in the `gateway-config` ConfigMap and must stay there: the health endpoint the readiness
probe checks exists only in that configuration.
