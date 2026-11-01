# Route Attachment

## How HTTPRoutes attach to Gateways

An HTTPRoute is only active if it successfully **attaches** to a Gateway. Attachment
requires:

1. The HTTPRoute's `spec.parentRefs[].name` matches an existing Gateway in the same
   namespace (by default).
2. The Gateway's listener accepts the HTTPRoute — the listener hostname must match the
   HTTPRoute's hostname (exact or wildcard intersection).

When an HTTPRoute references a Gateway that does not exist, the controller has nothing to
acknowledge the route. The HTTPRoute's `status.parents` list either stays empty or does not
show an entry with `Accepted: True` for that parent. Traffic is never routed.

## Diagnosing a detached HTTPRoute

```bash
kubectl get httproute web-route -n fl-k8s-0134 -o yaml
```

Look at `status.parents`. When the referenced Gateway does not exist, there is no
controller to write a parent entry — the list stays empty. When the Gateway exists but the
listener does not accept the route (hostname mismatch or wrong sectionName), a parent entry
appears with `Accepted: False`.

Always compare `spec.parentRefs[].name` with the actual Gateway names in the namespace:

```bash
kubectl get gateway -n fl-k8s-0134
```

## Current state

In namespace `fl-k8s-0134`:

- Gateway `main-gw` listens on port 80 for hostname `app.k8s-0134.fl.test`.
- HTTPRoute `web-route` has `parentRefs[0].name: wrong-gw` — a Gateway that does not
  exist. As a result, the route is not attached and traffic is not routed.
- Service `web:80` (nginx:1.27) is ready and waiting.

## The task

Fix the HTTPRoute so it references the correct Gateway:

```bash
kubectl edit httproute web-route -n fl-k8s-0134
```

Change `spec.parentRefs[0].name` from `wrong-gw` to `main-gw`.

## Verify

```bash
kubectl describe httproute web-route -n fl-k8s-0134
```

Look for a parent entry showing `Accepted: True` and `ResolvedRefs: True` for `main-gw`.

Test the route:

```bash
kubectl exec -n fl-k8s-0134 grader-client -- \
  curl -s -H "Host: app.k8s-0134.fl.test" \
  http://traefik.traefik-system.svc.cluster.local/
```

## Reference

- [HTTPRoute parentRefs](https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.ParentReference)
- [Route attachment](https://gateway-api.sigs.k8s.io/concepts/api-overview/#attaching-routes-to-gateways)
