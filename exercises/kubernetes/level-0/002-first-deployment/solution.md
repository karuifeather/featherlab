```bash
kubectl create deployment api --image=nginx:1.27 --replicas=2 -n staging
kubectl label deployment api tier=backend -n staging
```
