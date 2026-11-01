# Hostname Routing with Gateway

## How hostname matching works

A Gateway listener's `hostname` field controls which HTTPRoutes can attach to it. The
rules are:

- An **exact** listener hostname (e.g. `v1.example.com`) accepts only HTTPRoutes whose
  hostname is identical.
- A **wildcard** listener hostname (e.g. `*.example.com`) is a suffix match — it accepts
  any HTTPRoute whose hostname ends with `.example.com`. Both `v1.example.com` and
  `deep.v1.example.com` match; the apex `example.com` does not, because there is nothing
  before `.example.com`.
- An HTTPRoute hostname that is more specific than the listener is accepted (intersection
  rules in the spec).

The key point: an HTTPRoute whose hostname does NOT match the listener hostname is
**rejected** — its status shows `Accepted: False`. Traffic is never routed.

## Current state

In namespace `fl-k8s-0132`:

- Gateway `web-gw` has a wildcard listener hostname `*.k8s-0132.fl.test` on port 80.
  It accepts routes for `v1.k8s-0132.fl.test`, `v2.k8s-0132.fl.test`, or any other
  subdomain.
- HTTPRoute `v1-route` routes `v1.k8s-0132.fl.test` → Service `v1` (serves "v1").
- Service `v2` (serves "v2") is running, but no HTTPRoute exists for it yet.

## The task

Create HTTPRoute `v2-route` in namespace `fl-k8s-0132`:

- `parentRefs`: points to `web-gw`
- `hostnames`: `["v2.k8s-0132.fl.test"]`
- One rule: `backendRef` Service `v2` on port `80`

## Verify

Check the new route is accepted:

```bash
kubectl describe httproute v2-route -n fl-k8s-0132
```

Look for `Accepted: True` and `ResolvedRefs: True` in the status conditions.

Test both hostnames from inside the cluster:

```bash
# Should return "v1"
kubectl exec -n fl-k8s-0132 grader-client -- \
  curl -s -H "Host: v1.k8s-0132.fl.test" \
  http://traefik.traefik-system.svc.cluster.local/

# Should return "v2"
kubectl exec -n fl-k8s-0132 grader-client -- \
  curl -s -H "Host: v2.k8s-0132.fl.test" \
  http://traefik.traefik-system.svc.cluster.local/
```

## Reference

- [HTTPRoute hostname matching](https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.Hostname)
- [Gateway listener hostname](https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.Listener)
