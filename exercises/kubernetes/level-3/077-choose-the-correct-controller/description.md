The `fl-k8s-0077` namespace has four workloads, each using the wrong controller type. A controller mismatch creates operational problems: a web server as a Job will terminate instead of restarting, a batch task as a Deployment wastes resources by running forever, and so on.

The four workloads and their problems:

- **`web-server`** — currently a Job, but should be a Deployment. It is a long-running nginx web server that should restart on failure and support rolling updates.
- **`batch-task`** — currently a Deployment, but should be a Job. It runs a one-time processing task (`echo "batch done"`) that should exit when done.
- **`node-monitor`** — currently a Deployment with a fixed replica count, but should be a DaemonSet. It should run one Pod on every node in the cluster.
- **`report-runner`** — currently a bare Pod, but should be a CronJob. It should run daily at 6 AM.

Delete the incorrectly typed resources and create the right ones:

1. Deployment `web-server` — image `nginx:1.27`, 2 replicas
2. Job `batch-task` — image `busybox:1.36`, command `echo "batch done"`
3. DaemonSet `node-monitor` — image `busybox:1.36`
4. CronJob `report-runner` — image `busybox:1.36`, schedule `0 6 * * *`
