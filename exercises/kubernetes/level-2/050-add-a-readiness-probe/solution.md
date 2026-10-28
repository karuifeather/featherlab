Edit the Deployment and add a `readinessProbe` to the `web` container:

```bash
kubectl edit deployment web -n fl-k8s-0050
```

Add under the `web` container spec:

```yaml
readinessProbe:
  httpGet:
    path: /
    port: 80
```

Or patch it in one command:

```bash
kubectl patch deployment web -n fl-k8s-0050 --type=json \
  -p='[{"op":"add","path":"/spec/template/spec/containers/0/readinessProbe","value":{"httpGet":{"path":"/","port":80}}}]'
```

Then confirm the rollout completes:

```bash
kubectl rollout status deployment/web -n fl-k8s-0050
```

Once ready, `kubectl get pods -n fl-k8s-0050` will show `1/1` READY — the Pod has passed its
readiness probe and is eligible to receive traffic.
