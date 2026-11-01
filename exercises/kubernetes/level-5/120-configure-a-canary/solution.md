# Solution

Create the canary Deployment:

```bash
kubectl apply -n fl-k8s-0120 -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: checkout-canary
  namespace: fl-k8s-0120
  labels:
    app: checkout
    version: canary
spec:
  replicas: 1
  selector:
    matchLabels:
      app: checkout
      version: canary
  template:
    metadata:
      labels:
        app: checkout
        version: canary
    spec:
      terminationGracePeriodSeconds: 5
      containers:
        - name: nginx
          image: nginx:1.27
          ports:
            - containerPort: 80
EOF
```

Wait for the canary to roll out:

```bash
kubectl rollout status deployment/checkout-canary -n fl-k8s-0120
```

Confirm 5 endpoints are ready:

```bash
kubectl get endpointslices -l kubernetes.io/service-name=checkout -n fl-k8s-0120
```

The `ENDPOINTS` column should show 5 IPs total across both EndpointSlice objects (one per
Deployment controller).
