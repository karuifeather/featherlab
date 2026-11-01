# Find the Backends

## EndpointSlices

When a Service selects Pods, Kubernetes creates **EndpointSlices** to track the ready Pod IPs and ports. Each EndpointSlice carries a `kubernetes.io/service-name` label that links it back to its Service.

To inspect the backends for a Service:

```bash
kubectl get endpointslices -l kubernetes.io/service-name=store -n fl-k8s-0104
```

The output shows each backend address and whether it is `ready` or not:

```
NAME          ADDRESSTYPE   PORTS   ENDPOINTS      AGE
store-xxxxx   IPv4          80      10.244.0.5     1m
```

You can get more detail with `-o wide` or `-o yaml`:

```bash
kubectl get endpointslices -l kubernetes.io/service-name=store -n fl-k8s-0104 -o wide
```

## The task

Namespace `fl-k8s-0104` has a `store` Deployment currently running **1 replica** and a `store` Service.

1. Inspect the EndpointSlices to see the current backend state
2. Scale the Deployment to **2 replicas**
3. Verify that EndpointSlices show 2 ready backends

## Reference

- [EndpointSlices](https://kubernetes.io/docs/concepts/services-networking/endpoint-slices/)
