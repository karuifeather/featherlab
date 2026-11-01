# Inspect the Cross-Namespace Failure

## Reading HTTPRoute status conditions

When an HTTPRoute cannot resolve one of its backend references, the Gateway controller
sets the `ResolvedRefs` condition to `False` and writes a human-readable `message`
explaining why. Learning to read this message is the fastest way to diagnose cross-
namespace routing problems.

The condition is buried inside `status.parents[].conditions`. Use `jsonpath` to pull it
out directly:

```bash
kubectl get httproute web-route -n fl-k8s-0145 \
  -o jsonpath='{.status.parents[0].conditions[?(@.type=="ResolvedRefs")].message}'
```

A missing ReferenceGrant produces a message like:

```
BackendRef to Service fl-k8s-0145-backend/backend not permitted by any ReferenceGrant
```

The message tells you exactly which Service is blocked and in which namespace. That
namespace is where the ReferenceGrant must be created.

## Current state

Namespace `fl-k8s-0145`:

- Gateway `main-gw` listens on port 80 for hostname `app.k8s-0145.fl.test`.
- HTTPRoute `web-route` references Service `backend` in `fl-k8s-0145-backend`.

Namespace `fl-k8s-0145-backend`:

- Deployment `backend` and Service `backend` are running.
- There is **no ReferenceGrant**.

Inspect the HTTPRoute status to read the exact condition:

```bash
kubectl describe httproute web-route -n fl-k8s-0145
```

Look for the `Conditions` section under `Parents`. Note the `Type`, `Status`, `Reason`,
and `Message` fields for the `ResolvedRefs` condition.

## The task

1. Read the `ResolvedRefs` condition message on `web-route` to identify the blocked backend.
2. Create a ReferenceGrant named `allow-from-ingress-ns` in `fl-k8s-0145-backend` that
   permits HTTPRoute resources in `fl-k8s-0145` to reference Services there.

## Verify

After creating the ReferenceGrant:

```bash
kubectl get httproute web-route -n fl-k8s-0145
```

The `ResolvedRefs` condition should become `True`. Then test the route:

```bash
kubectl exec -n fl-k8s-0145 grader-client -- \
  curl -s -H "Host: app.k8s-0145.fl.test" \
  http://traefik.traefik-system.svc.cluster.local/
```

## Reference

- [HTTPRoute status — Gateway API](https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.HTTPRouteStatus)
- [ReferenceGrant](https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1beta1.ReferenceGrant)
