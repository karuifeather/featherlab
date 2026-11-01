# Route Across Namespaces

## The namespace boundary problem

Gateway API enforces a security boundary at the namespace level. When an HTTPRoute
references a backend Service in a **different** namespace, the Gateway controller
checks whether the target namespace has granted that permission. Without explicit
authorization, the HTTPRoute's `ResolvedRefs` condition becomes `False` and no
traffic reaches the backend.

This authorization is granted by a **ReferenceGrant** resource placed in the
_target_ namespace — the namespace that owns the Service.

## Current state

Namespace `fl-k8s-0144`:

- Gateway `main-gw` listens on port 80 for hostname `app.k8s-0144.fl.test`.
- HTTPRoute `web-route` references Service `backend` in namespace `fl-k8s-0144-backend`.

Namespace `fl-k8s-0144-backend`:

- Deployment `backend` and Service `backend` are running.
- There is **no ReferenceGrant** — the HTTPRoute is stuck with `ResolvedRefs=False`.

Verify the broken state:

```bash
kubectl get httproute web-route -n fl-k8s-0144 -o wide
kubectl get httproute web-route -n fl-k8s-0144 \
  -o jsonpath='{.status.parents[0].conditions[?(@.type=="ResolvedRefs")].message}'
```

The message will say something like `BackendRef to Service fl-k8s-0144-backend/backend not permitted by any ReferenceGrant`.

## The task

Create a `ReferenceGrant` in namespace `fl-k8s-0144-backend` named
`allow-from-ingress-ns` that authorizes HTTPRoute resources in `fl-k8s-0144` to
reference Services in `fl-k8s-0144-backend`.

A ReferenceGrant has two sections:

- `spec.from` — who is allowed to make the reference (the HTTPRoute's namespace)
- `spec.to` — what can be referenced (Service resources in this namespace)

## Verify

After creating the ReferenceGrant, the HTTPRoute should transition to
`ResolvedRefs=True`:

```bash
kubectl get httproute web-route -n fl-k8s-0144
```

Test the route from inside the cluster:

```bash
kubectl exec -n fl-k8s-0144 grader-client -- \
  curl -s -H "Host: app.k8s-0144.fl.test" \
  http://traefik.traefik-system.svc.cluster.local/
```

## Reference

- [ReferenceGrant — Gateway API](https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1beta1.ReferenceGrant)
- [Cross-namespace references](https://gateway-api.sigs.k8s.io/guides/backend-protocol/#cross-namespace-routing)
