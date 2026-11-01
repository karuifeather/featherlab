# Solution

Create the Service:

```bash
kubectl expose deployment api --port=80 --target-port=80 -n fl-k8s-0109
```

Verify the Service exists and has endpoints:

```bash
kubectl get svc api -n fl-k8s-0109
kubectl describe svc api -n fl-k8s-0109
```

Test DNS resolution from inside the namespace:

```bash
kubectl exec grader-client -n fl-k8s-0109 -- nslookup api
```

The output shows the ClusterIP address assigned to the Service.

**Declarative equivalent:**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: api
  namespace: fl-k8s-0109
spec:
  selector:
    app: api
  ports:
    - port: 80
      targetPort: 80
```
