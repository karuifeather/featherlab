# Solution

Inspect the GatewayClass to find the controller name:

```bash
kubectl get gatewayclass traefik -o yaml
```

Look at the `spec.controllerName` field:

```yaml
spec:
  controllerName: traefik.io/gateway-controller
```

Create the ConfigMap with that exact value:

```bash
kubectl create configmap my-notes \
  --from-literal=controllerName=traefik.io/gateway-controller \
  -n fl-k8s-0130
```

**Declarative equivalent:**

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-notes
  namespace: fl-k8s-0130
data:
  controllerName: traefik.io/gateway-controller
```

Apply with `kubectl apply -f my-notes.yaml`.

## Verify

```bash
kubectl get configmap my-notes -n fl-k8s-0130 -o jsonpath='{.data.controllerName}'
```

Expected output: `traefik.io/gateway-controller`
