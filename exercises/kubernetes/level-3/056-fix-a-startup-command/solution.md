Diagnose the failure:

```bash
kubectl logs worker -n fl-k8s-0056
# sh: echoo: not found
```

The command `echoo` is a typo. Since Pod specs are immutable, delete and recreate:

```bash
kubectl delete pod worker -n fl-k8s-0056
```

Recreate with the corrected command:

```bash
kubectl run worker \
  --image=busybox:1.36 \
  --restart=Never \
  -n fl-k8s-0056 \
  --command -- echo 'hello'
```

Wait for it to succeed:

```bash
kubectl wait pod/worker -n fl-k8s-0056 \
  --for=jsonpath={.status.phase}=Succeeded \
  --timeout=60s
```
