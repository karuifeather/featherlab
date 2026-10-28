Create the Secret using `kubectl create secret generic` with `--from-literal` flags:

```bash
kubectl create secret generic db-credentials \
  --from-literal=username=dbuser \
  --from-literal=password=s3cr3t \
  -n fl-k8s-0041
```

Verify the Secret was created with the correct type and keys:

```bash
kubectl get secret db-credentials -n fl-k8s-0041 -o yaml
```

The `data` field shows base64-encoded values. To inspect what's stored (this is only decoding,
not decryption — anyone with access can do this):

```bash
kubectl get secret db-credentials -n fl-k8s-0041 \
  -o jsonpath='{.data.username}' | base64 -d
```

You can also create the Secret from a YAML manifest using `.stringData` for readability:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: db-credentials
  namespace: fl-k8s-0041
type: Opaque
stringData:
  username: dbuser
  password: s3cr3t
```

```bash
kubectl apply -f secret.yaml
```
