```bash
kubectl scale deployment frontend --replicas=3 -n fl-k8s-0015
kubectl scale deployment worker --replicas=1 -n fl-k8s-0015
kubectl rollout status deployment/frontend -n fl-k8s-0015
kubectl get deployments -n fl-k8s-0015
```
