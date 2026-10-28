Edit the Deployment to add the volume and volumeMount:

```bash
kubectl edit deployment api -n fl-k8s-0044
```

Under `spec.template.spec`, add the volume:

```yaml
volumes:
  - name: api-keys-vol
    secret:
      secretName: api-keys
```

Under the `api` container spec, add the volumeMount:

```yaml
volumeMounts:
  - name: api-keys-vol
    mountPath: /etc/secrets/api-keys
    readOnly: true
```

Or apply with a JSON patch:

```bash
kubectl patch deployment api -n fl-k8s-0044 --type=json -p='[
  {
    "op": "add",
    "path": "/spec/template/spec/volumes",
    "value": [{"name": "api-keys-vol", "secret": {"secretName": "api-keys"}}]
  },
  {
    "op": "add",
    "path": "/spec/template/spec/containers/0/volumeMounts",
    "value": [{"name": "api-keys-vol", "mountPath": "/etc/secrets/api-keys", "readOnly": true}]
  }
]'
```

Wait for the rollout:

```bash
kubectl rollout status deployment/api -n fl-k8s-0044
```

Verify the files are present in the running Pod:

```bash
kubectl exec deployment/api -n fl-k8s-0044 -- ls /etc/secrets/api-keys
# primary.key  backup.key
```
