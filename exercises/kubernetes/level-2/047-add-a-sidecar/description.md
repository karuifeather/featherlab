The `web` Deployment in `fl-k8s-0047` currently runs a single nginx container. The platform
team wants a `metrics-exporter` sidecar added to every Pod so metrics can be scraped alongside
the main process.

Because all containers in a Pod share the same network namespace, the sidecar can reach the
main container on `localhost` — no extra networking is required.

Add a container named `metrics-exporter` with image `busybox:1.36` and the command
`sh -c 'while true; do echo "$(date): metrics ok"; sleep 10; done'` to the Deployment.
The final Deployment must have exactly 2 containers.
