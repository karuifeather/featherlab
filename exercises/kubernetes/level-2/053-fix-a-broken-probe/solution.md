Diagnosis: the readiness probe is configured to check port `8080`, but nginx listens on port `80`.
This causes every probe attempt to fail with a connection refused error. The Pod stays Running but
never passes the readiness gate, so `availableReplicas` is always 0.

```bash
kubectl describe deployment api -n fl-k8s-0053
# Under Containers > api > Readiness: you'll see "http-get http://:8080/ ..."
```

Fix: change the probe port from `8080` to `80` in the Deployment template:

```bash
kubectl edit deployment api -n fl-k8s-0053
# Change readinessProbe.httpGet.port from 8080 to 80
```

Or patch it directly:

```bash
kubectl patch deployment api -n fl-k8s-0053 --type=json \
  -p='[{"op":"replace","path":"/spec/template/spec/containers/0/readinessProbe/httpGet/port","value":80}]'
```

Then watch the rollout complete:

```bash
kubectl rollout status deployment/api -n fl-k8s-0053
```

Once the new Pod starts, the probe contacts port `80`, nginx responds with HTTP 200, and the Pod
is marked Ready. `kubectl get pods -n fl-k8s-0053` will show `1/1` READY.
