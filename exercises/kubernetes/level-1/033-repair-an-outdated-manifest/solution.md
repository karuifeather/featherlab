# Reference Solution

```bash
# Extract the manifest
kubectl get configmap legacy-manifest -n fl-k8s-0033 \
  -o jsonpath='{.data.deployment\.yaml}' > /tmp/legacy.yaml

# The manifest has apiVersion: apps/v1beta1 and no selector.
# Fix both:
# 1. Change apiVersion to apps/v1
# 2. Add spec.selector.matchLabels: {app: legacy-worker}

cat > /tmp/legacy-fixed.yaml << 'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: legacy-worker
  namespace: fl-k8s-0033
  labels:
    app: legacy-worker
spec:
  replicas: 1
  selector:
    matchLabels:
      app: legacy-worker
  template:
    metadata:
      labels:
        app: legacy-worker
    spec:
      terminationGracePeriodSeconds: 2
      containers:
        - name: worker
          image: nginx:1.27
EOF

kubectl apply -f /tmp/legacy-fixed.yaml
kubectl rollout status deployment/legacy-worker -n fl-k8s-0033
```
