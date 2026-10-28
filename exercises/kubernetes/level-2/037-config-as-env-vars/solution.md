Inject the ConfigMap key as an env var using `kubectl set env`:

```bash
kubectl set env deployment/app \
  --from=configmap/app-config \
  --keys=APP_ENV \
  -n fl-k8s-0037
```

This writes a `configMapKeyRef` entry under `env[]`. Confirm with:

```bash
kubectl rollout status deployment/app -n fl-k8s-0037
```

Alternatively, edit the Deployment manually:

```bash
kubectl edit deployment app -n fl-k8s-0037
```

Add under `spec.template.spec.containers[0]`:

```yaml
env:
  - name: APP_ENV
    valueFrom:
      configMapKeyRef:
        name: app-config
        key: APP_ENV
```

Verify the reference is wired:

```bash
kubectl get deployment app -n fl-k8s-0037 \
  -o jsonpath='{.spec.template.spec.containers[0].env}'
```
