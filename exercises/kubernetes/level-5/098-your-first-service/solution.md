# Solution

Expose the Deployment as a ClusterIP Service:

```bash
kubectl expose deployment web --port=80 --target-port=80 -n fl-k8s-0098
```

This creates a Service with `type: ClusterIP`, `port: 80`, `targetPort: 80`, and a selector
copied from the Deployment's `spec.template.metadata.labels` (`app=web`).

Verify the result:

```bash
kubectl get svc web -n fl-k8s-0098
kubectl describe svc web -n fl-k8s-0098
```

The `describe` output shows the selector and the Endpoints (ready Pod IP:port pairs).

**Declarative equivalent:**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: web
  namespace: fl-k8s-0098
spec:
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 80
```

Apply with `kubectl apply -f svc.yaml`.
