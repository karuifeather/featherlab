```bash
kubectl patch deployment stuck-app -n fl-k8s-0089 --type=merge \
  -p='{"spec":{"template":{"spec":{"nodeSelector":{"kubernetes.io/os":"linux"}}}}}'
kubectl rollout status deployment/stuck-app -n fl-k8s-0089 --timeout=120s
```
