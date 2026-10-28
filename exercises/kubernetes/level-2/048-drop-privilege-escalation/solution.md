Open the Deployment and add a `securityContext` block to the `api` container:

```bash
kubectl edit deployment api -n fl-k8s-0048
```

Under `spec.template.spec.containers[0]` (the `api` container), add:

```yaml
securityContext:
  allowPrivilegeEscalation: false
```

Alternatively, patch it directly:

```bash
kubectl patch deployment api -n fl-k8s-0048 --type=merge \
  -p '{"spec":{"template":{"spec":{"containers":[{"name":"api","securityContext":{"allowPrivilegeEscalation":false}}]}}}}'
```

Watch the rollout complete:

```bash
kubectl rollout status deployment/api -n fl-k8s-0048
```

Confirm the setting:

```bash
kubectl get deployment api -n fl-k8s-0048 \
  -o jsonpath='{.spec.template.spec.containers[0].securityContext}'
```
