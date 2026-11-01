# Solution

Create a ReferenceGrant in the backend namespace. Save this as `reference-grant.yaml`:

```yaml
apiVersion: gateway.networking.k8s.io/v1beta1
kind: ReferenceGrant
metadata:
  name: allow-from-ingress-ns
  namespace: fl-k8s-0144-backend
spec:
  from:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      namespace: fl-k8s-0144
  to:
    - group: ""
      kind: Service
```

Apply it:

```bash
kubectl apply -f reference-grant.yaml
```

Or create it directly:

```bash
kubectl apply -f - <<'EOF'
apiVersion: gateway.networking.k8s.io/v1beta1
kind: ReferenceGrant
metadata:
  name: allow-from-ingress-ns
  namespace: fl-k8s-0144-backend
spec:
  from:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      namespace: fl-k8s-0144
  to:
    - group: ""
      kind: Service
EOF
```

## Verify

Check that the HTTPRoute now has `ResolvedRefs=True`:

```bash
kubectl get httproute web-route -n fl-k8s-0144
# ACCEPTED should be True, SYNCED True (or Programmed True)
```

Test the route:

```bash
kubectl exec -n fl-k8s-0144 grader-client -- \
  curl -s -H "Host: app.k8s-0144.fl.test" \
  http://traefik.traefik-system.svc.cluster.local/
# → backend-0144
```

## Why this works

The ReferenceGrant lives in `fl-k8s-0144-backend` (the _target_ namespace). It declares
that resources of kind `HTTPRoute` in group `gateway.networking.k8s.io` from namespace
`fl-k8s-0144` may reference Services in this namespace. The Gateway controller checks for
this grant before resolving the backendRef. Once found, it rewrites the route and begins
forwarding traffic.
