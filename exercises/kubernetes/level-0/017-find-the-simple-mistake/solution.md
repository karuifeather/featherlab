Differences: `greeter` is scaled to 0; its label is `app=greter`; `greeter-check` was created
in the sandbox namespace.

```bash
kubectl scale deployment greeter --replicas=2 -n fl-k8s-0017
kubectl label deployment greeter app=greeter --overwrite -n fl-k8s-0017
kubectl run greeter-check --image=nginx:1.27 -n fl-k8s-0017
kubectl delete pod greeter-check -n fl-k8s-0017-sandbox
kubectl rollout status deployment/greeter -n fl-k8s-0017
```
