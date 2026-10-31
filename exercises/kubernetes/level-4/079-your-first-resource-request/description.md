A Deployment named `tracker` is already running in namespace `fl-k8s-0079`, but it has no resource requests configured. Without resource requests, the scheduler cannot make informed placement decisions.

Your task:

- Add a CPU request of `100m` to the `app` container of Deployment `tracker` in namespace `fl-k8s-0079`
- Ensure the Deployment finishes rolling out with 1 available replica

Reference: `kubectl explain deployment.spec.template.spec.containers.resources`
