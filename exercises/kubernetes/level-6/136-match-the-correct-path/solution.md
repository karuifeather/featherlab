# Solution

Edit HTTPRoute `web-route` and change the backendRef name in the `/api` rule from `app` to `api`:

```bash
kubectl edit httproute web-route -n fl-k8s-0136
```

Or apply the corrected manifest directly:

```bash
kubectl apply -n fl-k8s-0136 -f - <<'EOF'
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web-route
  namespace: fl-k8s-0136
spec:
  parentRefs:
    - name: web-gw
  hostnames:
    - "app.k8s-0136.fl.test"
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /app
      backendRefs:
        - name: app
          port: 80
    - matches:
        - path:
            type: PathPrefix
            value: /api
      backendRefs:
        - name: api
          port: 80
EOF
```

Verify the route is accepted and routing is correct:

```bash
kubectl get httproute web-route -n fl-k8s-0136 -o jsonpath='{.status.parents[0].conditions}'
```

Both `Accepted` and `ResolvedRefs` conditions should have `status: "True"`.
