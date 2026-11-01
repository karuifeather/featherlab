# Solution

Create a Service that uses the named port `http` as the targetPort:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: catalog
  namespace: fl-k8s-0101
spec:
  selector:
    app: catalog
  ports:
    - port: 80
      targetPort: http
```

```bash
kubectl apply -f svc.yaml
```

Verify the Service and its endpoints:

```bash
kubectl get svc catalog -n fl-k8s-0101
kubectl get endpointslices -l kubernetes.io/service-name=catalog -n fl-k8s-0101
```

The EndpointSlices should show 1 ready address.

**Note:** `kubectl expose` resolves named ports to numbers, so using a manifest is the correct approach here to keep `targetPort: http` as a string.
