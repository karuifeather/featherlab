# Solution

Create both Services:

```bash
kubectl expose deployment auth --port=80 --target-port=80 -n fl-k8s-0103
kubectl expose deployment gateway --port=8080 --target-port=80 -n fl-k8s-0103
```

Or apply manifests:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: auth
  namespace: fl-k8s-0103
spec:
  selector:
    app: auth
  ports:
    - port: 80
      targetPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: gateway
  namespace: fl-k8s-0103
spec:
  selector:
    app: gateway
  ports:
    - port: 8080
      targetPort: 80
```

Verify both have endpoints:

```bash
kubectl get endpoints -n fl-k8s-0103
# auth       10.x.x.x:80,10.x.x.x:80   (2 Pods)
# gateway    10.x.x.x:80                (1 Pod)
```
