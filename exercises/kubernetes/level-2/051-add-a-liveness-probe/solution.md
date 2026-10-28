Edit the Deployment and add a `livenessProbe` alongside the existing `readinessProbe`:

```bash
kubectl edit deployment api -n fl-k8s-0051
```

Add under the `api` container spec:

```yaml
livenessProbe:
  tcpSocket:
    port: 80
```

Or patch it directly:

```bash
kubectl patch deployment api -n fl-k8s-0051 --type=json \
  -p='[{"op":"add","path":"/spec/template/spec/containers/0/livenessProbe","value":{"tcpSocket":{"port":80}}}]'
```

Then confirm the rollout:

```bash
kubectl rollout status deployment/api -n fl-k8s-0051
```

After the rollout the container spec has both `readinessProbe` and `livenessProbe`. You can verify
with:

```bash
kubectl get deployment api -n fl-k8s-0051 -o jsonpath='{.spec.template.spec.containers[0].livenessProbe}'
```
