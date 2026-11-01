# Path-Based Routing

## Routing by HTTP path

A single HTTPRoute can contain multiple **rules**, each matching a different path. Two
common match types are:

- `PathPrefix` — matches any request whose path starts with the given prefix.
  `/app` matches `/app`, `/app/`, `/app/v1`, etc.
- `Exact` — matches only the exact path string.

Each rule has an independent `backendRefs` list, so different paths can reach different
Services. This is the standard way to host multiple services (e.g. an API and a frontend)
behind a single hostname and Gateway.

## Path forwarding

The Gateway API passes the original request path to the backend unchanged (unless a
`URLRewrite` filter is added). If your HTTPRoute has a `PathPrefix: /app` rule and the
backend is nginx, the backend receives the full path including `/app`. Make sure your
backend is configured to serve content at that path.

## Current state

In namespace `fl-k8s-0133`:

- Gateway `web-gw` listens on port 80 for hostname `k8s-0133.fl.test`.
- HTTPRoute `web-route` has **one** rule: `PathPrefix /app` → Service `app:80`.
  Requests to `/app/` reach the `app` Service and return `app-service`.
- Service `api:80` is running (serves `api-service` at `/api/`), but there is no rule
  routing `/api` traffic to it.

## The task

Edit HTTPRoute `web-route` to add a second rule:

- Match: `PathPrefix /api`
- Backend: Service `api` on port `80`

```bash
kubectl edit httproute web-route -n fl-k8s-0133
```

Add a second entry under `spec.rules`:

```yaml
- matches:
    - path:
        type: PathPrefix
        value: /api
  backendRefs:
    - name: api
      port: 80
```

## Verify

Check the HTTPRoute is still accepted:

```bash
kubectl describe httproute web-route -n fl-k8s-0133
```

Test both paths (use trailing slash to avoid a redirect):

```bash
# Should return "app-service"
kubectl exec -n fl-k8s-0133 grader-client -- \
  curl -s -H "Host: k8s-0133.fl.test" \
  http://traefik.traefik-system.svc.cluster.local/app/

# Should return "api-service"
kubectl exec -n fl-k8s-0133 grader-client -- \
  curl -s -H "Host: k8s-0133.fl.test" \
  http://traefik.traefik-system.svc.cluster.local/api/
```

## Reference

- [HTTPRoute path matching](https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.HTTPRouteMatch)
- [PathMatchType](https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.PathMatchType)
