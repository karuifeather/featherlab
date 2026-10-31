```bash
kubectl set resources deployment proxy -c gateway \
  --requests=cpu=150m --limits=memory=96Mi \
  -n fl-k8s-0081
kubectl rollout status deployment/proxy -n fl-k8s-0081 --timeout=120s
```
