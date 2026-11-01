# Solution

Confirm stable is healthy before doing anything:

```bash
kubectl rollout status deployment/api-stable -n fl-k8s-0122
```

Inspect the failing canary:

```bash
kubectl describe deployment api-canary -n fl-k8s-0122
kubectl get pods -l app=api,version=canary -n fl-k8s-0122
```

The Events section and Pod status will show `ImagePullBackOff` for `nginx:1.27.99`.

Delete the canary Deployment:

```bash
kubectl delete deployment api-canary -n fl-k8s-0122
```

Verify the Service still has endpoints from stable:

```bash
kubectl get endpointslices -l kubernetes.io/service-name=api -n fl-k8s-0122
```

Three stable Pod IPs should remain. Stable is still serving 100% of traffic.
