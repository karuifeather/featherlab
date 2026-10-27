```bash
NS=fl-k8s-0016
kubectl scale deployment reports --replicas=2 -n $NS
kubectl label deployment reports team=analytics -n $NS
kubectl rollout status deployment/reports -n $NS
```

`kubectl edit deployment reports -n fl-k8s-0016` (change `spec.replicas`, add the label under
`metadata.labels`) is equivalent. Common mistake: adding `team=analytics` only to the Pod
template's labels.
