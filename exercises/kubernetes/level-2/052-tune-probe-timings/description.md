The `slow-start` Deployment in `fl-k8s-0052` has no readiness probe. For a container that takes a
few seconds to initialise before it can serve requests, the default probe timing — first check
immediately, every 10 seconds, fail after 3 tries — is fine for nginx. But in production you often
work with services that take longer to boot.

Three fields control how quickly Kubernetes acts on probe results:

- **`initialDelaySeconds`**: how long to wait after the container starts before running the first
  check. This is the startup grace period.
- **`periodSeconds`**: how often to run the check after the initial delay.
- **`failureThreshold`**: how many consecutive failures must occur before the container is removed
  from endpoints (readiness) or restarted (liveness).

Add an HTTP readiness probe to the `app` container that checks path `/` on port `80`, and set
`initialDelaySeconds: 5`, `periodSeconds: 15`, and `failureThreshold: 6`. For containers with very
long startup times, consider a startup probe instead of a large `initialDelaySeconds` — a startup
probe pauses liveness and readiness checks entirely until the container signals it is done booting.
