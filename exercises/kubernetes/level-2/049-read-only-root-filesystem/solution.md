Open the Deployment and add a `securityContext` block to the `app` container:

```bash
kubectl edit deployment hardened -n fl-k8s-0049
```

Under `spec.template.spec.containers[0]` (the `app` container), add:

```yaml
securityContext:
  readOnlyRootFilesystem: true
```

Alternatively, patch it directly:

```bash
kubectl patch deployment hardened -n fl-k8s-0049 --type=merge \
  -p '{"spec":{"template":{"spec":{"containers":[{"name":"app","securityContext":{"readOnlyRootFilesystem":true}}]}}}}'
```

Watch the rollout complete:

```bash
kubectl rollout status deployment/hardened -n fl-k8s-0049
```

Confirm the setting:

```bash
kubectl get deployment hardened -n fl-k8s-0049 \
  -o jsonpath='{.spec.template.spec.containers[0].securityContext}'
```
