# Cross-Namespace Routing Mastery

## A subtle misconfiguration

Not every cross-namespace routing problem is a missing ReferenceGrant. Sometimes the
grant exists but contains an error: a wrong namespace in the `from` block. The Gateway
controller finds the grant but it does not match the HTTPRoute's actual namespace, so the
route remains unresolved.

This exercise gives you a realistic repair scenario where the grant is present but
broken, and you must identify and fix the exact field.

## Current state

Namespace `fl-k8s-0147`:

- Ingress `web-ingress` routes `web.k8s-0147.fl.test` to Service `web` in the same
  namespace. This works fine — Ingress only supports same-namespace backends.
- Gateway `main-gw` listens for `api.k8s-0147.fl.test`.
- HTTPRoute `api-route` references Service `api` in `fl-k8s-0147-api`.

Namespace `fl-k8s-0147-api`:

- Deployment `api` and Service `api` are running.
- ReferenceGrant `allow-from-gw-ns` exists — but something is wrong with it.

Inspect the HTTPRoute status:

```bash
kubectl get httproute api-route -n fl-k8s-0147 -o wide
```

`ResolvedRefs` is `False`. Now look at the ReferenceGrant:

```bash
kubectl get referencegrant allow-from-gw-ns -n fl-k8s-0147-api -o yaml
```

Read `spec.from[0].namespace` carefully. Compare it with the HTTPRoute's actual
namespace.

## The task

Fix the ReferenceGrant so that `spec.from[0].namespace` correctly names the namespace
where the HTTPRoute lives (`fl-k8s-0147`).

You can either edit the existing grant or delete and recreate it.

## Ingress and ReferenceGrant — what to know

Ingress rules reference backends **in the same namespace only**. The Ingress API was
designed before multi-namespace routing was formalized, and it has no mechanism to
reference a Service in another namespace. A ReferenceGrant has no effect on Ingress
behavior. Only Gateway API resources (HTTPRoute, GRPCRoute, etc.) use ReferenceGrants.

## Verify

After fixing the grant:

```bash
kubectl get httproute api-route -n fl-k8s-0147
# ResolvedRefs should be True

kubectl exec -n fl-k8s-0147 grader-client -- \
  curl -s -H "Host: api.k8s-0147.fl.test" \
  http://traefik.traefik-system.svc.cluster.local/
# → api-0147
```

## Reference

- [ReferenceGrant spec](https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1beta1.ReferenceGrant)
- [Ingress backend requirements](https://kubernetes.io/docs/concepts/services-networking/ingress/#the-ingress-resource)
