# Solution

Create the Service:

```bash
kubectl expose deployment metrics --port=80 --target-port=80 -n fl-k8s-0111
```

Inspect DNS search paths:

```bash
kubectl exec grader-client -n fl-k8s-0111 -- cat /etc/resolv.conf
```

Test resolution using both forms:

```bash
# Short form — works because of search paths
kubectl exec grader-client -n fl-k8s-0111 -- nslookup metrics

# Namespace-qualified form — works from any namespace
kubectl exec grader-client -n fl-k8s-0111 -- nslookup metrics.fl-k8s-0111
```

Both should return the ClusterIP assigned to the `metrics` Service.

**Declarative equivalent:**

```yaml
apiVersion: v1
kind: Service
metadata:
  name: metrics
  namespace: fl-k8s-0111
spec:
  selector:
    app: metrics
  ports:
    - port: 80
      targetPort: 80
```
