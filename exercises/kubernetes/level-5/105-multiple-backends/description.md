# Multiple Backends

## Load balancing across Pods

When a Service has multiple ready endpoints (Pods), kube-proxy distributes traffic across them. Each request may go to a different Pod — this is the basis of in-cluster load balancing.

You can observe traffic distribution by checking which Pod receives requests. With nginx's default access log, each Pod logs its own requests.

## The task

Namespace `fl-k8s-0105` has a `worker` Deployment currently running **1 replica** and a `worker` Service.

1. Scale the Deployment to **3 replicas**
2. Confirm all 3 Pods appear as ready endpoints in EndpointSlices
3. The grader will send an HTTP request through the Service to verify traffic flows

## Commands

```bash
# Scale
kubectl scale deployment worker --replicas=3 -n fl-k8s-0105

# Watch rollout
kubectl rollout status deployment/worker -n fl-k8s-0105 --timeout=120s

# Check backends
kubectl get endpointslices -l kubernetes.io/service-name=worker -n fl-k8s-0105
```

## Reference

- [EndpointSlices](https://kubernetes.io/docs/concepts/services-networking/endpoint-slices/)
