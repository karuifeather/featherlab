# Solution

The Service has `port: 80` but should have `port: 8080` with `targetPort: 80`.

**Option 1 — Edit in place:**

```bash
kubectl edit svc api -n fl-k8s-0100
```

Change the ports section to:

```yaml
ports:
  - port: 8080
    targetPort: 80
    protocol: TCP
```

**Option 2 — Apply a corrected manifest:**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: api
  namespace: fl-k8s-0100
spec:
  selector:
    app: api
  ports:
    - port: 8080
      targetPort: 80
```

```bash
kubectl apply -f svc.yaml
```

Verify:

```bash
kubectl get svc api -n fl-k8s-0100
# Should show: PORT(S) 8080/TCP
```
