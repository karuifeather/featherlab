# Solution

Create the Service:

```bash
kubectl expose deployment backend --port=80 --target-port=80 -n fl-k8s-0099
```

Verify it has endpoints:

```bash
kubectl describe svc backend -n fl-k8s-0099
```

The `Endpoints` field should list one or more `<pod-ip>:80` entries.

Test connectivity:

```bash
kubectl run client --restart=Never --image=busybox:1.36 -n fl-k8s-0099 \
  --rm -it -- wget -qO- http://backend:80/
```

The nginx welcome page HTML confirms the Service is routing traffic to the application.

**Declarative equivalent:**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: backend
  namespace: fl-k8s-0099
spec:
  selector:
    app: backend
  ports:
    - port: 80
      targetPort: 80
```
