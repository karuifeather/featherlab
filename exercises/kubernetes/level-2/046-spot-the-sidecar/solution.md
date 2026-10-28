The Deployment has two containers: `web` (nginx, the main workload serving traffic) and
`log-agent` (busybox emitting periodic log lines — the sidecar).

List the containers to confirm:

```bash
kubectl get deployment app -n fl-k8s-0046 -o jsonpath='{.spec.template.spec.containers[*].name}'
```

Check the sidecar's output:

```bash
kubectl logs deployment/app -n fl-k8s-0046 -c log-agent
```

Add the required label to the Pod template:

```bash
kubectl patch deployment app -n fl-k8s-0046 --type=merge \
  -p '{"spec":{"template":{"metadata":{"labels":{"sidecar-identified":"true"}}}}}'
```

The patch triggers a rolling update. Watch it complete:

```bash
kubectl rollout status deployment/app -n fl-k8s-0046
```
