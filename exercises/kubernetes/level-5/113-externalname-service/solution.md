# Solution

Create a manifest for the ExternalName Service:

```yaml
# external-api.yaml
apiVersion: v1
kind: Service
metadata:
  name: external-api
  namespace: fl-k8s-0113
spec:
  type: ExternalName
  externalName: api.example.com
```

Apply it:

```bash
kubectl apply -f external-api.yaml
```

Verify the Service type and externalName:

```bash
kubectl get svc external-api -n fl-k8s-0113
kubectl get svc external-api -n fl-k8s-0113 -o yaml | grep -A2 externalName
```

The output should show `type: ExternalName` and `externalName: api.example.com`.

Note that `api.example.com` is a synthetic target for this exercise. In production, the
`externalName` value must be a hostname that resolves from the cluster nodes at runtime.
