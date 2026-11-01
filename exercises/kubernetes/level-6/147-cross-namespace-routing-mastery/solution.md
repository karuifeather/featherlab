# Solution

## Step 1: Identify the broken field

```bash
kubectl get referencegrant allow-from-gw-ns -n fl-k8s-0147-api \
  -o jsonpath='{.spec.from[0].namespace}'
# → wrong-namespace
```

The grant authorizes HTTPRoutes from `wrong-namespace`, but the HTTPRoute lives in
`fl-k8s-0147`. The namespace mismatch means the controller finds the grant but rejects
it — it does not cover the route's actual namespace.

## Step 2: Fix the ReferenceGrant

**Option A — edit in place:**

```bash
kubectl edit referencegrant allow-from-gw-ns -n fl-k8s-0147-api
```

Change `namespace: wrong-namespace` to `namespace: fl-k8s-0147` under `spec.from[0]`.

**Option B — delete and recreate:**

```bash
kubectl delete referencegrant allow-from-gw-ns -n fl-k8s-0147-api

kubectl apply -f - <<'EOF'
apiVersion: gateway.networking.k8s.io/v1beta1
kind: ReferenceGrant
metadata:
  name: allow-from-gw-ns
  namespace: fl-k8s-0147-api
spec:
  from:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      namespace: fl-k8s-0147
  to:
    - group: ""
      kind: Service
EOF
```

## Step 3: Verify

```bash
# ResolvedRefs should flip to True
kubectl get httproute api-route -n fl-k8s-0147

# Test the API route
kubectl exec -n fl-k8s-0147 grader-client -- \
  curl -s -H "Host: api.k8s-0147.fl.test" \
  http://traefik.traefik-system.svc.cluster.local/
# → api-0147

# The Ingress route is unaffected
kubectl exec -n fl-k8s-0147 grader-client -- \
  curl -s -H "Host: web.k8s-0147.fl.test" \
  http://traefik.traefik-system.svc.cluster.local/
# → web-0147
```

## Key insight

The `from[0].namespace` field is the most error-prone part of a ReferenceGrant. It must
match the _exact_ namespace name of the HTTPRoute (or other referencing resource) — not
the backend's namespace, not the Gateway's namespace. When debugging a persistent
`ResolvedRefs=False`, always inspect the ReferenceGrant and verify each field:

1. `metadata.namespace` — must be the backend/target namespace
2. `from[0].namespace` — must be the HTTPRoute's namespace
3. `from[0].kind` — must match the referring resource kind (`HTTPRoute`)
4. `to[0].kind` — must match the referenced resource kind (`Service`)
