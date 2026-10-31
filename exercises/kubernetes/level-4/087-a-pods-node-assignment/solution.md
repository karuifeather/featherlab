```bash
kubectl patch deployment beacon -n fl-k8s-0087 --type=merge \
  -p='{"spec":{"template":{"spec":{"nodeSelector":{"kubernetes.io/os":"linux"}}}}}'
kubectl rollout status deployment/beacon -n fl-k8s-0087 --timeout=120s
```
