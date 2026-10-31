Inspect a running Job's status and logs, then create your own Job.

A Job named `data-processor` is already running in namespace `fl-k8s-0066`. Inspect its status and logs.

Then create a new Job named `summary-job`:

- Image: `busybox:1.36`
- Command: `sh -c 'echo summary-done'`
- Pod restartPolicy: `Never`
- Job must complete successfully
