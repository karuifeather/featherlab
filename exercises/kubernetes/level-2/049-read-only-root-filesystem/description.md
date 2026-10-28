The `hardened` Deployment in `fl-k8s-0049` runs a busybox container with no securityContext.
Without `readOnlyRootFilesystem: true`, any process inside the container can write files
anywhere on the root filesystem, which increases the blast radius of a compromised workload.

`readOnlyRootFilesystem: true` mounts the container's root filesystem as read-only. The
container can still write to explicitly mounted volumes (`emptyDir`, `PersistentVolumeClaim`,
etc.) but cannot modify anything in the image's own layers.

Enable `readOnlyRootFilesystem: true` on the `app` container's `securityContext` and allow
the Deployment to roll out. The busybox sleep loop does not write to the filesystem, so the
container will continue running normally after the change.
