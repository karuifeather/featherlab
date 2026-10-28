# Reference Solution

```bash
# Generate a starter manifest (dry-run, no cluster write)
kubectl create deployment api-server \
  --image=nginx:1.27 \
  --replicas=2 \
  --dry-run=client -o yaml > /tmp/api.yaml

# Edit: rename container to "api" and add version=v1 label to pod template
# Under spec.template.spec.containers[0].name: change "nginx" → "api"
# Under spec.template.metadata.labels: add "version: v1"

# Apply
kubectl apply -f /tmp/api.yaml -n fl-k8s-0022

# Verify
kubectl rollout status deployment/api-server -n fl-k8s-0022
kubectl get deployment api-server -n fl-k8s-0022 -o yaml | grep -A5 "template:"
```
