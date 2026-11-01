# Route by Request Header

## The problem

Namespace `fl-k8s-0137` has two backend Services:

- `standard` — the default backend, returns `standard-response`
- `premium` — the upgraded backend, returns `premium-response`

HTTPRoute `web-route` is supposed to route requests carrying the header `X-User-Type: premium`
to the `premium` Service, and all other requests to `standard`. But the route is broken: the
header-match rule references a Service named `vip` that does not exist.

```bash
kubectl get httproute web-route -n fl-k8s-0137 -o yaml
```

Look at `status.parents[0].conditions`. You should see `ResolvedRefs: False` with reason
`BackendNotFound` — the controller cannot resolve the backend reference.

## How header matching works

An HTTPRoute rule can match on request headers using `spec.rules[].matches[].headers`:

```yaml
rules:
  - matches:
      - headers:
          - name: X-User-Type
            value: premium
    backendRefs:
      - name: premium # <-- needs to match an existing Service name
        port: 80
  - backendRefs: # fallback rule: no match condition = matches everything
      - name: standard
        port: 80
```

Rules are evaluated in order. The first matching rule wins. A rule with no `matches` block
catches all requests that earlier rules did not match.

## Your task

Fix HTTPRoute `web-route` in namespace `fl-k8s-0137` so that the header-match rule correctly
references the `premium` Service:

```bash
kubectl edit httproute web-route -n fl-k8s-0137
```

After the fix, `status.parents[0].conditions` should show both `Accepted: True` and
`ResolvedRefs: True`.

## Reference

- [HTTPRoute header matching (Gateway API docs)](https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.HTTPHeaderMatch)
