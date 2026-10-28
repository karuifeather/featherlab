The `web` Deployment in `fl-k8s-0043` is missing two TLS-related environment variables. A
Secret named `tls-credentials` already exists in the namespace with the cert and key data,
but the container has no `TLS_CERT` or `TLS_KEY` env vars configured.

Update the Deployment so that container `web` reads:

- `TLS_CERT` from Secret `tls-credentials`, key `cert-file`
- `TLS_KEY` from Secret `tls-credentials`, key `key-file`

**secretKeyRef vs configMapKeyRef:** The syntax for sourcing env vars from a Secret is
identical to sourcing from a ConfigMap — the only difference is the field name:

```yaml
# From a ConfigMap
valueFrom:
  configMapKeyRef:
    name: my-config
    key: some-key

# From a Secret
valueFrom:
  secretKeyRef:
    name: my-secret
    key: some-key
```

Use a Secret (not a ConfigMap) whenever the value is sensitive: credentials, tokens, or
certificates. Unlike ConfigMaps, Secrets can be encrypted at rest when the cluster is
configured with an EncryptionConfiguration.
