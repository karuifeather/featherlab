# Solution

The Service selector has a typo: `app: fontend` (missing the 'r' in 'frontend').

**Fix using kubectl edit:**

```bash
kubectl edit svc frontend -n fl-k8s-0102
```

Change:

```yaml
selector:
  app: fontend
```

To:

```yaml
selector:
  app: frontend
```

**Or apply a corrected manifest:**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: frontend
  namespace: fl-k8s-0102
spec:
  selector:
    app: frontend
  ports:
    - port: 80
      targetPort: 80
```

Verify endpoints appear immediately:

```bash
kubectl get endpoints frontend -n fl-k8s-0102
# Should show two Pod IP:port pairs
```
