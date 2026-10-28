```bash
kubectl run web --image=nginx:1.27 -n fl-k8s-0001
kubectl wait --for=condition=Ready pod/web -n fl-k8s-0001 --timeout=120s
```

Declarative alternative: a Pod manifest with `metadata.namespace: fl-k8s-0001`, applied with
`kubectl apply -f pod.yaml`.
