```bash
kubectl get pods -A | grep fl-k8s-0013
kubectl run web --image=nginx:1.27 -n fl-k8s-0013
kubectl delete pod scratch -n fl-k8s-0013-sandbox
kubectl wait --for=condition=Ready pod/web -n fl-k8s-0013 --timeout=120s
```

Common mistakes: forgetting `-n` (the Pod lands in `default`), or deleting `web` from the
sandbox instead of `scratch`.
