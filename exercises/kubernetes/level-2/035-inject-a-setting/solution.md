Set the environment variable on the Deployment:

```bash
kubectl set env deployment/app APP_ENV=production -n fl-k8s-0035
```

Confirm the rollout completes:

```bash
kubectl rollout status deployment/app -n fl-k8s-0035
```

Alternatively, edit the Deployment manually:

```bash
kubectl edit deployment app -n fl-k8s-0035
```

Find `spec.template.spec.containers` and add an `env` block:

```yaml
containers:
  - name: app
    image: nginx:1.27
    env:
      - name: APP_ENV
        value: "production"
```

Verify the variable is set:

```bash
kubectl get deployment app -n fl-k8s-0035 \
  -o jsonpath='{.spec.template.spec.containers[0].env}'
```
