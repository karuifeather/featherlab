The `app` Deployment in `fl-k8s-0042` is missing an environment variable. A Secret named
`app-secret` already exists in the namespace and contains an API key, but the container
has no `API_KEY` env var configured.

Inspect the Secret to discover its key name, then update the Deployment so that container `app`
reads env var `API_KEY` from that Secret using `secretKeyRef`.

**About base64:** Secret values are base64-encoded in the API for binary safety, not for
security. Base64 encoding is trivially reversible — anyone with `get` permission on the Secret
can decode the values. To inspect the key in this exercise:

```bash
kubectl get secret app-secret -n fl-k8s-0042 \
  -o jsonpath='{.data.api-key}' | base64 -d
```

Use this command to understand the data, but never log or echo Secret values in production.
