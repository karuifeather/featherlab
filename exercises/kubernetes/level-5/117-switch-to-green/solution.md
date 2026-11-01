# Solution

Edit the Service selector to target green:

```bash
kubectl edit svc web -n fl-k8s-0117
```

Change:

```yaml
selector:
  app: web
  version: blue
```

To:

```yaml
selector:
  app: web
  version: green
```

Save and exit.

Verify:

```bash
kubectl get endpoints web -n fl-k8s-0117
kubectl get pods -n fl-k8s-0117 -o wide -l version=green
```

The endpoint IPs should match green Pod IPs.

**Declarative patch alternative:**

```bash
kubectl patch svc web -n fl-k8s-0117 \
  --type=merge \
  -p='{"spec":{"selector":{"app":"web","version":"green"}}}'
```
