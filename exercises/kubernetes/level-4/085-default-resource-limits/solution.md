```yaml
# default-limits.yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: default-limits
  namespace: fl-k8s-0085
spec:
  limits:
    - type: Container
      default:
        cpu: "200m"
        memory: "128Mi"
      defaultRequest:
        cpu: "100m"
        memory: "64Mi"
      max:
        cpu: "1"
```

```bash
kubectl apply -f default-limits.yaml
kubectl describe limitrange default-limits -n fl-k8s-0085
```
