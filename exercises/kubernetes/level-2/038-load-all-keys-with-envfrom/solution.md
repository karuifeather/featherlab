Edit the Deployment and add `envFrom` under the container spec:

```bash
kubectl edit deployment app -n fl-k8s-0038
```

Add the `envFrom` block under `spec.template.spec.containers[0]`:

```yaml
envFrom:
  - configMapRef:
      name: settings
```

Save and exit. Alternatively, use a patch:

```bash
kubectl patch deployment app -n fl-k8s-0038 --type=merge -p \
  '{"spec":{"template":{"spec":{"containers":[{"name":"app","envFrom":[{"configMapRef":{"name":"settings"}}]}]}}}}'
```

Confirm the rollout:

```bash
kubectl rollout status deployment/app -n fl-k8s-0038
```

Verify `envFrom` is present:

```bash
kubectl get deployment app -n fl-k8s-0038 \
  -o jsonpath='{.spec.template.spec.containers[0].envFrom}'
```
