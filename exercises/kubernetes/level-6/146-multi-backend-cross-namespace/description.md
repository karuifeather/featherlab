# Multi-Backend Cross-Namespace

## Weighted traffic splitting across namespaces

An HTTPRoute can split traffic across multiple backends using `weight` on each
`backendRef`. When those backends live in different namespaces, each target namespace
must have its own `ReferenceGrant` — there is no single grant that covers multiple
namespaces.

This is intentional by design: each namespace team independently decides whether to
allow references from a given HTTPRoute namespace. A team managing `v1` and a team
managing `v2` each opt in separately.

## Current state

Namespace `fl-k8s-0146`:

- Gateway `main-gw` listens on port 80 for hostname `api.k8s-0146.fl.test`.
- HTTPRoute `api-route` references two backends with equal weight:
  - Service `api-v1` in `fl-k8s-0146-v1` (weight 50)
  - Service `api-v2` in `fl-k8s-0146-v2` (weight 50)

Namespace `fl-k8s-0146-v1`:

- Deployment `api-v1` and Service `api-v1` are running (serves `version-1`).
- **No ReferenceGrant.**

Namespace `fl-k8s-0146-v2`:

- Deployment `api-v2` and Service `api-v2` are running (serves `version-2`).
- **No ReferenceGrant.**

Inspect the broken HTTPRoute:

```bash
kubectl describe httproute api-route -n fl-k8s-0146
```

The `ResolvedRefs` condition will be `False`. Look at the `Message` to see which
backends are blocked.

## The task

Create a ReferenceGrant named `allow-from-gw-ns` in **each** backend namespace:

1. In `fl-k8s-0146-v1` — authorizing HTTPRoute in `fl-k8s-0146` to reference Services there.
2. In `fl-k8s-0146-v2` — authorizing HTTPRoute in `fl-k8s-0146` to reference Services there.

Both grants need the same `from` (the HTTPRoute's namespace) and the same `to`
(Service kind). They differ only in `metadata.namespace`.

## Verify

After creating both grants:

```bash
kubectl get httproute api-route -n fl-k8s-0146
```

`ResolvedRefs` should be `True`. Because traffic splits 50/50 between the two
backends, repeated requests will reach both versions:

```bash
for i in $(seq 1 6); do
  kubectl exec -n fl-k8s-0146 grader-client -- \
    curl -s -H "Host: api.k8s-0146.fl.test" \
    http://traefik.traefik-system.svc.cluster.local/
done
```

You should see a mix of `version-1` and `version-2` responses.

## Reference

- [HTTPRoute backendRefs with weights](https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.BackendRef)
- [ReferenceGrant](https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1beta1.ReferenceGrant)
