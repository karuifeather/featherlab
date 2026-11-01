# Solution

Create a file `gateway-route.yaml` with both resources:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: my-gateway
  namespace: fl-k8s-0131
spec:
  gatewayClassName: traefik
  listeners:
    - name: http
      port: 80
      protocol: HTTP
      hostname: "app.k8s-0131.fl.test"
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: my-route
  namespace: fl-k8s-0131
spec:
  parentRefs:
    - name: my-gateway
  hostnames:
    - "app.k8s-0131.fl.test"
  rules:
    - backendRefs:
        - name: backend
          port: 80
```

Apply it:

```bash
kubectl apply -f gateway-route.yaml
```

## Verify

```bash
kubectl get gateway my-gateway -n fl-k8s-0131
kubectl describe httproute my-route -n fl-k8s-0131
```

Test the route (the curl pod is already running):

```bash
kubectl exec -n fl-k8s-0131 grader-client -- \
  curl -s -H "Host: app.k8s-0131.fl.test" \
  http://traefik.traefik-system.svc.cluster.local/
```

The default nginx welcome page HTML confirms the route is working.
