# Solution

Scale the Deployment to 3 replicas:

```bash
kubectl scale deployment worker --replicas=3 -n fl-k8s-0105
kubectl rollout status deployment/worker -n fl-k8s-0105 --timeout=120s
```

Verify all 3 endpoints are ready:

```bash
kubectl get endpointslices -l kubernetes.io/service-name=worker -n fl-k8s-0105 -o wide
# Should show 3 addresses, all ready
```

Test HTTP connectivity from a client Pod:

```bash
kubectl run client --restart=Never --image=busybox:1.36 -n fl-k8s-0105 \
  --rm -it -- wget -qO- http://worker.fl-k8s-0105:80/
```
