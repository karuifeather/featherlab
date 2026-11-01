# Solution

## Step 1: Read the condition message

```bash
kubectl get httproute web-route -n fl-k8s-0145 \
  -o jsonpath='{.status.parents[0].conditions[?(@.type=="ResolvedRefs")].message}'
```

Expected output (approximately):

```
BackendRef to Service fl-k8s-0145-backend/backend not permitted by any ReferenceGrant
```

This tells you the Service `backend` in namespace `fl-k8s-0145-backend` needs a
ReferenceGrant granting permission to the HTTPRoute in `fl-k8s-0145`.

## Step 2: Create the ReferenceGrant

```bash
kubectl apply -f - <<'EOF'
apiVersion: gateway.networking.k8s.io/v1beta1
kind: ReferenceGrant
metadata:
  name: allow-from-ingress-ns
  namespace: fl-k8s-0145-backend
spec:
  from:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      namespace: fl-k8s-0145
  to:
    - group: ""
      kind: Service
EOF
```

## Step 3: Verify

```bash
# Check the condition flipped to True
kubectl get httproute web-route -n fl-k8s-0145 \
  -o jsonpath='{.status.parents[0].conditions[?(@.type=="ResolvedRefs")].status}'
# → True

# Test the route
kubectl exec -n fl-k8s-0145 grader-client -- \
  curl -s -H "Host: app.k8s-0145.fl.test" \
  http://traefik.traefik-system.svc.cluster.local/
# → backend-0145
```

## Key fields explained

| Field                | Value                 | Meaning                                            |
| -------------------- | --------------------- | -------------------------------------------------- |
| `metadata.namespace` | `fl-k8s-0145-backend` | The grant lives in the _target_ namespace          |
| `from[].kind`        | `HTTPRoute`           | Only HTTPRoute objects may use this grant          |
| `from[].namespace`   | `fl-k8s-0145`         | Only HTTPRoutes from this namespace are authorized |
| `to[].group`         | `""`                  | Core API group (Services)                          |
| `to[].kind`          | `Service`             | Only Service references are permitted              |
