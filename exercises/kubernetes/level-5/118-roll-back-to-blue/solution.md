# Solution

Edit the Service selector to target blue:

```bash
kubectl edit svc web -n fl-k8s-0118
```

Change:

```yaml
selector:
  app: web
  version: green
```

To:

```yaml
selector:
  app: web
  version: blue
```

Save and exit.

Verify:

```bash
kubectl get endpoints web -n fl-k8s-0118
kubectl get pods -n fl-k8s-0118 -o wide -l version=blue
```

The endpoint IPs should match blue Pod IPs.

**Declarative patch alternative:**

```bash
kubectl patch svc web -n fl-k8s-0118 \
  --type=merge \
  -p='{"spec":{"selector":{"app":"web","version":"blue"}}}'
```
