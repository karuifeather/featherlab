A Deployment named `proxy` is running in namespace `fl-k8s-0081` with two containers: `gateway` (nginx) and `sidecar` (busybox). The `sidecar` container already has resource budgets configured; `gateway` does not.

Your task:

- Set a CPU request of `150m` on the `gateway` container of Deployment `proxy` in namespace `fl-k8s-0081`
- Set a memory limit of `96Mi` on the `gateway` container
- Do not change the `sidecar` container's resources
- The Deployment must finish rolling out with 1 available replica

Reference: `kubectl explain deployment.spec.template.spec.containers.resources`
