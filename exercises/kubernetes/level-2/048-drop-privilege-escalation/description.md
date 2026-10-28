The `api` Deployment in `fl-k8s-0048` runs nginx but has no `securityContext` configured on
its container. Without `allowPrivilegeEscalation: false`, a container process could potentially
use `setuid` binaries or other mechanisms to gain more privileges than its parent process.

`allowPrivilegeEscalation: false` prevents any child process inside the container from gaining
additional privileges beyond what the container started with. This is a low-risk, high-value
security control that should be applied to every workload unless there is a specific reason not to.

Set `allowPrivilegeEscalation: false` on the `api` container's `securityContext` and allow the
Deployment to roll out.
