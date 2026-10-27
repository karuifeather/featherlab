```bash
kubectl create deployment api --image=nginx:1.27 --replicas=2 -n fl-k8s-0002
kubectl label deployment api tier=backend -n fl-k8s-0002
kubectl rollout status deployment/api -n fl-k8s-0002
```
