Edit the Deployment and add the two env vars with `secretKeyRef` in the container spec:

```bash
kubectl edit deployment web -n fl-k8s-0043
```

Add the following under the `web` container's spec:

```yaml
env:
  - name: TLS_CERT
    valueFrom:
      secretKeyRef:
        name: tls-credentials
        key: cert-file
  - name: TLS_KEY
    valueFrom:
      secretKeyRef:
        name: tls-credentials
        key: key-file
```

Or apply both changes with a JSON patch:

```bash
kubectl patch deployment web -n fl-k8s-0043 --type=json -p='[
  {
    "op": "add",
    "path": "/spec/template/spec/containers/0/env",
    "value": [
      {"name": "TLS_CERT", "valueFrom": {"secretKeyRef": {"name": "tls-credentials", "key": "cert-file"}}},
      {"name": "TLS_KEY",  "valueFrom": {"secretKeyRef": {"name": "tls-credentials", "key": "key-file"}}}
    ]
  }
]'
```

Wait for the rollout:

```bash
kubectl rollout status deployment/web -n fl-k8s-0043
```
