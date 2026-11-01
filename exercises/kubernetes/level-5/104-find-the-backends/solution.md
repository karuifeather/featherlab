# Solution

Scale the Deployment to 2 replicas:

```bash
kubectl scale deployment store --replicas=2 -n fl-k8s-0104
kubectl rollout status deployment/store -n fl-k8s-0104 --timeout=120s
```

Verify 2 ready endpoints in EndpointSlices:

```bash
kubectl get endpointslices -l kubernetes.io/service-name=store -n fl-k8s-0104 -o wide
# Should show 2 addresses listed as ready
```
