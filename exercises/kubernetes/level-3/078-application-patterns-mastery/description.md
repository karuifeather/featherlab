The `fl-k8s-0078` namespace has a broken platform. Three resources were deployed with configuration errors, and one resource needs to be created from scratch.

**What is broken:**

- **Deployment `api`** — the init container `config-load` uses image `busybox:BROKEN`. The Deployment will not roll out until this is fixed.
- **CronJob `archiver`** — the schedule is `0 0 31 2 *` (February 31st — a date that never exists). It will never fire.
- **DaemonSet `metrics`** — the container `collector` uses image `busybox:BROKEN`. No Pods will start.

**What needs to be created:**

- **Job `data-fix`** — run a one-time task: image `busybox:1.36`, command `echo 'data fixed'`.

Fix everything so that:

1. Deployment `api` init container `config-load` uses `busybox:1.36` and the Deployment is fully rolled out.
2. Job `data-fix` exists and has completed.
3. CronJob `archiver` has the corrected schedule `0 0 * * 0` (every Sunday at midnight).
4. DaemonSet `metrics` has all Pods ready with image `busybox:1.36`.
