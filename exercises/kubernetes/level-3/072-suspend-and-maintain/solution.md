Patch all three fields in one command:

```bash
kubectl patch cronjob cleanup -n fl-k8s-0072 \
  -p '{"spec":{"suspend":true,"successfulJobsHistoryLimit":3,"failedJobsHistoryLimit":1}}'
```

Verify the result:

```bash
kubectl get cronjob cleanup -n fl-k8s-0072
# NAME      SCHEDULE    SUSPEND   ACTIVE   LAST SCHEDULE
# cleanup   0 2 * * *   True      0        <none>
```

The `SUSPEND: True` column confirms no new Jobs will be created. To inspect the limits:

```bash
kubectl get cronjob cleanup -n fl-k8s-0072 -o jsonpath='{.spec.successfulJobsHistoryLimit},{.spec.failedJobsHistoryLimit}'
# 3,1
```

When maintenance is complete, resume the CronJob by setting `suspend: false`.
