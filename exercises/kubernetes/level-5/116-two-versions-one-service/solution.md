# Solution

Scale `web-green` to 3 replicas:

```bash
kubectl scale deployment web-green --replicas=3 -n fl-k8s-0116
```

Wait for the rollout to complete:

```bash
kubectl rollout status deployment/web-green -n fl-k8s-0116 --timeout=60s
```

Verify the Service selector is unchanged (still targets blue):

```bash
kubectl get svc web -n fl-k8s-0116 -o jsonpath='{.spec.selector}'
```

Output: `{"app":"web","version":"blue"}` — green Pods are ready but still receive no traffic.
