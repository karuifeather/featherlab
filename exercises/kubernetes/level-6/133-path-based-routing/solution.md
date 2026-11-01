# Solution

Edit the HTTPRoute to add the `/api` rule:

```bash
kubectl edit httproute web-route -n fl-k8s-0133
```

The complete `spec.rules` section should be:

```yaml
spec:
  parentRefs:
    - name: web-gw
  hostnames:
    - "k8s-0133.fl.test"
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /app
      backendRefs:
        - name: app
          port: 80
    - matches:
        - path:
            type: PathPrefix
            value: /api
      backendRefs:
        - name: api
          port: 80
```

**Declarative approach** — save as `web-route.yaml` and apply:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web-route
  namespace: fl-k8s-0133
spec:
  parentRefs:
    - name: web-gw
  hostnames:
    - "k8s-0133.fl.test"
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /app
      backendRefs:
        - name: app
          port: 80
    - matches:
        - path:
            type: PathPrefix
            value: /api
      backendRefs:
        - name: api
          port: 80
```

```bash
kubectl apply -f web-route.yaml
```

## Verify

```bash
kubectl exec -n fl-k8s-0133 grader-client -- \
  curl -s -H "Host: k8s-0133.fl.test" \
  http://traefik.traefik-system.svc.cluster.local/app/
# → app-service

kubectl exec -n fl-k8s-0133 grader-client -- \
  curl -s -H "Host: k8s-0133.fl.test" \
  http://traefik.traefik-system.svc.cluster.local/api/
# → api-service
```
