Create a Kubernetes Job that runs a one-time command to completion.

Create a Job named `hello-job` in namespace `fl-k8s-0065`:

- Container image: `busybox:1.36`
- Command: `sh -c 'echo hello from job'`
- Pod restartPolicy: `Never`
- The Job must complete successfully
