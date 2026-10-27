```bash
kubectl get deploy,pod,svc -A | grep -E 'NAMESPACE|fl-k8s-0003'
kubectl create deployment catalog --image=nginx:1.27 --replicas=2 -n fl-k8s-0003
kubectl rollout status deployment/catalog -n fl-k8s-0003
kubectl delete deployment catalog -n fl-k8s-0003-sandbox
```

`kubectl create deployment catalog` labels its Pods `app=catalog`, which is what the Service
selects. Copying the sandbox manifest also works once `namespace`, `uid`, `resourceVersion`,
`creationTimestamp` and `status` are edited out.

Wrong but tempting: `kubectl delete namespace fl-k8s-0003-sandbox` also deletes `notes`.
