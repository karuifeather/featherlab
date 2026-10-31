Not every Pod runs a long-lived server. Kubernetes also handles one-shot tasks: a Pod that runs a
command, finishes, and exits. The key difference from a server Pod is `restartPolicy`.

**restartPolicy and Pod phase**

Every Pod has a `restartPolicy` that controls what happens when its containers exit:

- `Always` (the default): Kubernetes restarts containers regardless of their exit code. This is
  what you want for a web server.
- `Never`: The container runs once. If it exits 0, the Pod moves to `Succeeded`. If it exits
  non-zero, the Pod moves to `Failed`. No retries.
- `OnFailure`: Like Never, but restarts on non-zero exit codes.

A completed Pod has phase `Succeeded`, **not** `Running`. Grading checks for `Succeeded` — a Pod
still Running or stuck in `ContainerCreating` will not pass.

**What you will do**

Create a Pod named `task-runner` in `fl-k8s-0054` using `busybox:1.36` that runs
`echo "task complete"` and exits successfully.

```bash
kubectl run task-runner \
  --image=busybox:1.36 \
  --restart=Never \
  -n fl-k8s-0054 \
  --command -- echo "task complete"
```

Then wait for it to complete:

```bash
kubectl wait pod/task-runner -n fl-k8s-0054 \
  --for=jsonpath={.status.phase}=Succeeded \
  --timeout=60s
```
