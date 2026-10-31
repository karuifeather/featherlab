Production Jobs need two safety controls: a retry limit so a failing task does not spin forever,
and a time budget so a stuck task does not hold cluster resources indefinitely.

**backoffLimit — retry cap**

`spec.backoffLimit` (default: 6) sets how many times Kubernetes will retry failed Pods before
declaring the Job failed. Each retry waits longer (exponential backoff). A `backoffLimit: 3`
Job will try up to 4 total Pods (1 initial + 3 retries).

**activeDeadlineSeconds — wall-clock budget**

`spec.activeDeadlineSeconds` sets a time limit from when the Job started. If the Job has not
completed within that window, Kubernetes terminates all its Pods and marks the Job with
reason `DeadlineExceeded`. This cap is independent of how many retries have been attempted.

**Both fields together**

```yaml
spec:
  backoffLimit: 3
  activeDeadlineSeconds: 60
```

The Job will fail if either condition triggers first: too many Pod failures, or too much time
elapsed. For a fast, reliable command like `echo`, neither limit will trigger — but the fields
are still required for safety in real workloads.

**What you will do**

Create a Job named `safe-task` in `fl-k8s-0069` using `busybox:1.36` with the command
`sh -c 'echo safe-done'`, `backoffLimit: 3`, and `activeDeadlineSeconds: 60`.
