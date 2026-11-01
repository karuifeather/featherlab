# Solution

The Service selector uses `app: report` (missing the trailing `s`). The Pods have label `app: reports`.

**Fix:**

```bash
kubectl edit svc reports -n fl-k8s-0107
```

Change:

```yaml
selector:
  app: report
```

To:

```yaml
selector:
  app: reports
```

Endpoints appear immediately without a rollout:

```bash
kubectl get endpoints reports -n fl-k8s-0107
# reports   10.x.x.x:80,10.x.x.x:80
```
