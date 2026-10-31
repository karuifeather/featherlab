Patch both `schedule` and `suspend` in one operation:

```bash
kubectl patch cronjob metrics -n fl-k8s-0073 \
  -p '{"spec":{"schedule":"*/10 * * * *","suspend":false}}'
```

Verify:

```bash
kubectl get cronjob metrics -n fl-k8s-0073
# NAME      SCHEDULE        SUSPEND   ACTIVE   LAST SCHEDULE
# metrics   */10 * * * *    False     0        <none>
```

The `SUSPEND: False` and `SCHEDULE: */10 * * * *` confirm both changes applied. Kubernetes will now create a new Job every 10 minutes when the next scheduled time arrives.
