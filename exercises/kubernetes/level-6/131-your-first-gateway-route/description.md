# Your First Gateway Route

## Two resources to expose a Service

In the Gateway API model, exposing a Service to HTTP traffic takes two resources:

- **Gateway** — declares the listener (which port, which protocol, which hostnames). It
  references a `GatewayClass` (the controller implementation) and becomes active once the
  controller reconciles it.
- **HTTPRoute** — attaches to a Gateway via `parentRefs` and maps hostname + path rules
  to backend Services. An HTTPRoute is only active if its parent Gateway accepts it.

The separation gives platform teams control over listener configuration (the Gateway) while
application teams manage routing rules (the HTTPRoute) independently.

## Current state

A `backend` Deployment and Service (nginx:1.27) are running in namespace `fl-k8s-0131`.
Neither a Gateway nor an HTTPRoute exists yet, so no traffic can reach the backend.

## The task

1. Create a **Gateway** named `my-gateway` in namespace `fl-k8s-0131`:
   - `gatewayClassName: traefik`
   - One listener: `name: http`, `port: 80`, `protocol: HTTP`,
     `hostname: "app.k8s-0131.fl.test"`

2. Create an **HTTPRoute** named `my-route` in namespace `fl-k8s-0131`:
   - `parentRefs` pointing to `my-gateway`
   - `hostnames: ["app.k8s-0131.fl.test"]`
   - One rule with a `backendRef` to Service `backend` on port `80`

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

## Verify

Check the Gateway status — look for `Accepted: True` and `Programmed: True` conditions:

```bash
kubectl describe gateway my-gateway -n fl-k8s-0131
```

Check the HTTPRoute status — look for `Accepted: True` and `ResolvedRefs: True`:

```bash
kubectl describe httproute my-route -n fl-k8s-0131
```

Test the route manually from inside the cluster:

```bash
kubectl exec -n fl-k8s-0131 grader-client -- \
  curl -s -H "Host: app.k8s-0131.fl.test" \
  http://traefik.traefik-system.svc.cluster.local/
```

You should see the default nginx welcome page HTML.

## Reference

- [Gateway API: Gateway resource](https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.Gateway)
- [Gateway API: HTTPRoute resource](https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.HTTPRoute)
