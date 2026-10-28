The `catalog` web service should be running in the team namespace `fl-k8s-0003`, where its
Service is waiting for it. A teammate applied the Deployment to the wrong namespace:
`fl-k8s-0003-sandbox`, which other people use for experiments. Right now the `catalog` Service
has nothing to send traffic to.

Put things right:

- `catalog` runs in `fl-k8s-0003`, and its Service routes to it;
- the misplaced copy is gone from the sandbox;
- everything else in the sandbox keeps running.

Kubernetes has no command that moves an object between namespaces. Use `-n` (or
`metadata.namespace` in a manifest) to be explicit about where every command acts.
