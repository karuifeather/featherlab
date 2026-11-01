# Solution

Create the Service in `fl-k8s-0110-app`:

```bash
kubectl expose deployment catalog --port=80 --target-port=80 -n fl-k8s-0110-app
```

Verify it has endpoints:

```bash
kubectl describe svc catalog -n fl-k8s-0110-app
```

Test DNS resolution and HTTP connectivity from the client namespace:

```bash
kubectl exec grader-client -n fl-k8s-0110 -- nslookup catalog.fl-k8s-0110-app
kubectl exec grader-client -n fl-k8s-0110 -- wget -qO- http://catalog.fl-k8s-0110-app:80/
```

The `nslookup` output shows the ClusterIP. The `wget` output shows the nginx welcome page.

**Declarative equivalent:**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: catalog
  namespace: fl-k8s-0110-app
spec:
  selector:
    app: catalog
  ports:
    - port: 80
      targetPort: 80
```
