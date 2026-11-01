# Solution

Expose the Deployment as a NodePort Service:

```bash
kubectl expose deployment web --port=80 --target-port=80 --type=NodePort -n fl-k8s-0114
```

Kubernetes assigns a nodePort from the 30000–32767 range automatically.

Verify:

```bash
kubectl get svc web -n fl-k8s-0114
```

Output shows `TYPE: NodePort` and the `PORT(S)` column shows something like `80:31234/TCP`.

**Declarative equivalent:**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web
  namespace: fl-k8s-0114
spec:
  type: NodePort
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 80
```

Apply with `kubectl apply -f svc.yaml`. The `nodePort` field is intentionally omitted to let
Kubernetes assign one.
