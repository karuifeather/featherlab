# Solution

The readiness probe path `/ready` causes 404s from nginx. Change it to `/`:

```bash
kubectl edit deployment payments -n fl-k8s-0106
```

Find the `readinessProbe` block and change:

```yaml
readinessProbe:
  httpGet:
    path: /ready # ← change this
    port: 80
```

To:

```yaml
readinessProbe:
  httpGet:
    path: / # ← fixed
    port: 80
```

Save the edit. Kubernetes triggers a rolling update. Wait for it:

```bash
kubectl rollout status deployment/payments -n fl-k8s-0106 --timeout=120s
```

Verify 3 ready endpoints:

```bash
kubectl get endpoints payments -n fl-k8s-0106
# payments   10.x.x.x:80,10.x.x.x:80,10.x.x.x:80
```
