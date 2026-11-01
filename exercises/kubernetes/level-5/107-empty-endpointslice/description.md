# Empty EndpointSlice

## Diagnosing missing backends

When a Service has no backends, requests fail with a connection error. The first diagnostic step is to check its EndpointSlices:

```bash
kubectl get endpointslices -l kubernetes.io/service-name=reports -n fl-k8s-0107
```

An empty or missing ENDPOINTS column means the selector matches no ready Pods. To diagnose why, compare:

1. **What the Service selector requires:**

   ```bash
   kubectl get svc reports -n fl-k8s-0107 -o jsonpath='{.spec.selector}'
   ```

2. **What labels the Pods actually have:**
   ```bash
   kubectl get pods -n fl-k8s-0107 --show-labels
   ```

A mismatch — even a single character — means no endpoints.

## The task

In namespace `fl-k8s-0107`, the `reports` Service has no ready endpoints even though the `reports` Deployment is running with 2 replicas. Find the selector mismatch and fix it.

## Reference

- [Debugging Services](https://kubernetes.io/docs/tasks/debug/debug-application/debug-service/)
