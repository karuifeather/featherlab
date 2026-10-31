Delete a failed Job and recreate it with a correct command and backoff limit.

A Job named `batch` is already failing in namespace `fl-k8s-0067`. Inspect it, then delete it and recreate it with:

- Image: `busybox:1.36`
- Command: `sh -c 'echo batch-done'`
- `backoffLimit: 2`
- Pod restartPolicy: `Never`
- Job must complete successfully
