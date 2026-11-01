# Solution

Edit HTTPRoute `web-route` and change the backendRef name from `vip` to `premium` in the
header-match rule:

```bash
kubectl edit httproute web-route -n fl-k8s-0137
```

Or apply the corrected manifest:

```bash
kubectl apply -n fl-k8s-0137 -f - <<'EOF'
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web-route
  namespace: fl-k8s-0137
spec:
  parentRefs:
    - name: web-gw
  hostnames:
    - "app.k8s-0137.fl.test"
  rules:
    - matches:
        - headers:
            - name: X-User-Type
              value: premium
      backendRefs:
        - name: premium
          port: 80
    - backendRefs:
        - name: standard
          port: 80
EOF
```

Verify the route is accepted:

```bash
kubectl get httproute web-route -n fl-k8s-0137 \
  -o jsonpath='{.status.parents[0].conditions}'
```

Both `Accepted` and `ResolvedRefs` should be `True`.

Test the default path (no header) to confirm the standard backend is still reachable:

```bash
kubectl exec grader-client -n fl-k8s-0137 -- \
  curl --silent \
  --connect-to app.k8s-0137.fl.test::traefik.traefik-system.svc.cluster.local:80 \
  http://app.k8s-0137.fl.test/
# Expected: standard-response
```
