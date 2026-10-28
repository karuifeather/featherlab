First, confirm the key name in the Secret:

```bash
kubectl get secret app-secret -n fl-k8s-0042 -o jsonpath='{.data}' | tr ',' '\n'
# Output shows: "api-key":"<base64value>"
```

Then patch the Deployment to add the `API_KEY` env var sourced from the Secret:

```bash
kubectl edit deployment app -n fl-k8s-0042
```

In the container spec, add:

```yaml
env:
  - name: API_KEY
    valueFrom:
      secretKeyRef:
        name: app-secret
        key: api-key
```

Or apply the change imperatively:

```bash
kubectl set env deployment/app \
  API_KEY=unused -n fl-k8s-0042
```

Note: `kubectl set env` with a literal value does not create a `secretKeyRef`. Use
`kubectl edit` or `kubectl patch` to wire it to the Secret:

```bash
kubectl patch deployment app -n fl-k8s-0042 --type=json -p='[
  {
    "op": "add",
    "path": "/spec/template/spec/containers/0/env",
    "value": [{"name": "API_KEY", "valueFrom": {"secretKeyRef": {"name": "app-secret", "key": "api-key"}}}]
  }
]'
```

Wait for the rollout:

```bash
kubectl rollout status deployment/app -n fl-k8s-0042
```
