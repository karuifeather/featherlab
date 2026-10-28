Create the `docker-registry` Secret using fake credentials (the registry hostname is
`registry.example.com`, which is not a real registry — this keeps credentials synthetic):

```bash
kubectl create secret docker-registry registry-creds \
  --docker-server=registry.example.com \
  --docker-username=fake-user \
  --docker-password=fake-pass \
  -n fl-k8s-0045
```

Verify the type:

```bash
kubectl get secret registry-creds -n fl-k8s-0045 -o jsonpath='{.type}'
# kubernetes.io/dockerconfigjson
```

Add the Secret to the Deployment's `imagePullSecrets`:

```bash
kubectl patch deployment private-app -n fl-k8s-0045 --type=json -p='[
  {
    "op": "add",
    "path": "/spec/template/spec/imagePullSecrets",
    "value": [{"name": "registry-creds"}]
  }
]'
```

Or use `kubectl edit deployment private-app -n fl-k8s-0045` and add under
`spec.template.spec`:

```yaml
imagePullSecrets:
  - name: registry-creds
```

Wait for the rollout (the public image `nginx:1.27` still pulls successfully):

```bash
kubectl rollout status deployment/private-app -n fl-k8s-0045
```
