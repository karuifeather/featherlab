```bash
kubectl create quota team-budget \
  --hard=requests.cpu=500m,requests.memory=512Mi,limits.cpu=2,limits.memory=2Gi \
  -n fl-k8s-0083
```

Or with a manifest:

```yaml
# team-budget.yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: team-budget
  namespace: fl-k8s-0083
spec:
  hard:
    requests.cpu: "500m"
    requests.memory: "512Mi"
    limits.cpu: "2"
    limits.memory: "2Gi"
```

```bash
kubectl apply -f team-budget.yaml
kubectl describe resourcequota team-budget -n fl-k8s-0083
```
