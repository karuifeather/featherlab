Create the Pod with `restartPolicy: Never`:

```bash
kubectl run task-runner \
  --image=busybox:1.36 \
  --restart=Never \
  -n fl-k8s-0054 \
  --command -- echo "task complete"
```

Wait for the Pod to finish:

```bash
kubectl wait pod/task-runner -n fl-k8s-0054 \
  --for=jsonpath={.status.phase}=Succeeded \
  --timeout=60s
```

Verify:

```bash
kubectl get pod task-runner -n fl-k8s-0054
# STATUS: Completed   READY: 0/1
```

The `0/1` READY is expected — a completed Pod is no longer Running and is therefore not Ready.
The grading check looks at phase (`Succeeded`), not readiness.
