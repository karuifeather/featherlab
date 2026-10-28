Create the ConfigMap with both keys:

```bash
kubectl create configmap app-config \
  --from-literal=APP_ENV=production \
  --from-literal=LOG_LEVEL=info \
  -n fl-k8s-0036
```

Verify the data:

```bash
kubectl get configmap app-config -n fl-k8s-0036 -o yaml
```

You should see:

```yaml
data:
  APP_ENV: production
  LOG_LEVEL: info
```

Alternatively, use describe:

```bash
kubectl describe configmap app-config -n fl-k8s-0036
```
