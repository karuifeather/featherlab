# Reference Solution

```bash
# Diagnose
kubectl rollout history deployment/auth -n fl-k8s-0032
# revisionHistoryLimit: 0 — only 1 revision, no rollback available

kubectl get pods -n fl-k8s-0032
# Pods show ImagePullBackOff — wrong image tag (typo)

kubectl describe pod -n fl-k8s-0032 -l app=auth | grep -A3 "Events:"

# Fix forward — correct the typo
kubectl set image deployment/auth server=nginx:1.27 -n fl-k8s-0032
kubectl rollout status deployment/auth -n fl-k8s-0032
```
