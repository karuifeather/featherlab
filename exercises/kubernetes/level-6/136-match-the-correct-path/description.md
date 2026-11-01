# Match the Correct Path

## The problem

Namespace `fl-k8s-0136` has two backend Services:

- `app` — returns `app-response`
- `api` — returns `api-response`

A Gateway `web-gw` and HTTPRoute `web-route` are already deployed. The route has two path rules:

| Path prefix | Should route to | Currently routes to |
| ----------- | --------------- | ------------------- |
| `/app`      | `app:80`        | `app:80` ✓          |
| `/api`      | `api:80`        | `app:80` ✗          |

Requests to `/api` return `app-response` instead of `api-response` because the second rule has
the wrong backendRef.

## How HTTPRoute path matching works

An HTTPRoute rule specifies both **what to match** (under `matches`) and **where to send it**
(under `backendRefs`). The path match only filters which requests the rule handles; the
backendRef determines which Service receives those requests.

```yaml
rules:
  - matches:
      - path:
          type: PathPrefix
          value: /api
    backendRefs:
      - name: api # <-- this is what you need to fix
        port: 80
```

## Your task

Fix HTTPRoute `web-route` in namespace `fl-k8s-0136` so that:

- Requests to `/api` reach Service `api:80`
- Requests to `/app` still reach Service `app:80`

```bash
kubectl get httproute web-route -n fl-k8s-0136 -o yaml
kubectl edit httproute web-route -n fl-k8s-0136
```

## Reference

- [HTTPRoute backendRefs (Gateway API docs)](https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.HTTPBackendRef)
