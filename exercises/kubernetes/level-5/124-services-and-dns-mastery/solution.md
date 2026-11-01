# Solution

## Fix 1: Repair the `db` Service selector

Describe the Service to see the fault:

```bash
kubectl describe svc db -n fl-k8s-0124-data
```

The `Selector` field shows `app=database` but the `db` Deployment's Pods have label `app=db`.
The `Endpoints` field shows `<none>`.

Patch the selector:

```bash
kubectl patch svc db -n fl-k8s-0124-data \
  --type=merge -p '{"spec":{"selector":{"app":"db"}}}'
```

Verify endpoints:

```bash
kubectl get endpointslices -l kubernetes.io/service-name=db -n fl-k8s-0124-data
```

One ready endpoint should appear.

## Fix 2: Scale the canary Deployment

```bash
kubectl scale deployment web-canary --replicas=1 -n fl-k8s-0124
kubectl rollout status deployment/web-canary -n fl-k8s-0124
```

Verify the `web` Service now has 3 endpoints:

```bash
kubectl get endpointslices -l kubernetes.io/service-name=web -n fl-k8s-0124
```

## Verify HTTP

```bash
kubectl exec grader-client -n fl-k8s-0124 -- wget -qO- http://web.fl-k8s-0124:80/
```

The nginx welcome page confirms the `web` Service is routing traffic through both blue and canary Pods.
