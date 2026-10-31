Create the CronJob imperatively with `kubectl create cronjob`. The `--restart=Never` flag sets the Pod's restartPolicy to Never:

```bash
kubectl create cronjob report \
  --image=busybox:1.36 \
  --schedule='*/5 * * * *' \
  --restart=Never \
  -n fl-k8s-0070 \
  -- sh -c 'echo report-$(date +%s)'
```

Alternatively, apply a manifest:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: report
  namespace: fl-k8s-0070
spec:
  schedule: "*/5 * * * *"
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: Never
          containers:
            - name: task
              image: busybox:1.36
              command: ["sh", "-c", "echo report-$(date +%s)"]
```

Verify:

```bash
kubectl get cronjob report -n fl-k8s-0070
# SCHEDULE         SUSPEND   ACTIVE   LAST SCHEDULE
# */5 * * * *      False     0        <none>
```

The CronJob shows `SUSPEND: False` and the schedule `*/5 * * * *`. Kubernetes will create a Job each time the schedule fires.
