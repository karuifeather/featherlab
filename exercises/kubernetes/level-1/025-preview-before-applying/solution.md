# Reference Solution

```bash
# Export current manifest
kubectl get deployment notification-svc -n fl-k8s-0025 -o yaml > /tmp/notif.yaml

# Edit: change nginx:1.27 to nginx:1.27-alpine in the containers section
sed -i 's|nginx:1.27$|nginx:1.27-alpine|' /tmp/notif.yaml

# Preview the change (exit code 1 = differences found, which is expected)
kubectl diff -f /tmp/notif.yaml || true

# Apply
kubectl apply -f /tmp/notif.yaml

# Verify
kubectl rollout status deployment/notification-svc -n fl-k8s-0025
```
