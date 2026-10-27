Diagnosis: `kubectl describe pod` shows `Readiness probe failed: ... connect: connection refused`
for `:8080`. nginx listens on port 80 (the container port named `http`).

```bash
kubectl patch deployment status-page -n fl-k8s-0005 --type=json \
  -p='[{"op":"replace","path":"/spec/template/spec/containers/0/readinessProbe/httpGet/port","value":80}]'
kubectl rollout status deployment/status-page -n fl-k8s-0005
kubectl get endpointslices -n fl-k8s-0005
```

Alternatives that also pass: `port: http` (the named port), or editing the Deployment with
`kubectl edit`. Deleting the probe does not pass.
