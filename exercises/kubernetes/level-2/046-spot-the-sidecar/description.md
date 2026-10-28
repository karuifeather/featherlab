The `app` Deployment in `fl-k8s-0046` is running fine, but the team wants to confirm you can
identify which container is the main workload and which is the sidecar.

Kubernetes Pods can run multiple containers that share the same network namespace. A _sidecar_
is a helper container that runs alongside the main container — common uses include log shippers,
metric exporters, and proxies.

Inspect the Deployment to find all of its containers and identify which one is acting as a sidecar.
Once you know which container is the sidecar, add the label `sidecar-identified=true` to the Pod
template's metadata so the check can confirm you found it.
