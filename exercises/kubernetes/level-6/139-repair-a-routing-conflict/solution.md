# Solution

Edit HTTPRoute `admin-route` and change the path match from `/` to `/admin`:

```bash
kubectl apply -n fl-k8s-0139 -f - <<'EOF'
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: admin-route
  namespace: fl-k8s-0139
spec:
  parentRefs:
    - name: web-gw
  hostnames:
    - "app.k8s-0139.fl.test"
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /admin
      backendRefs:
        - name: admin
          port: 80
EOF
```

Verify both routes are accepted:

```bash
kubectl get httproute -n fl-k8s-0139
```

Confirm routing is correct:

```bash
# / should return main-app
kubectl exec grader-client -n fl-k8s-0139 -- \
  curl --silent \
  --connect-to app.k8s-0139.fl.test::traefik.traefik-system.svc.cluster.local:80 \
  http://app.k8s-0139.fl.test/

# /admin should return admin-panel
kubectl exec grader-client -n fl-k8s-0139 -- \
  curl --silent \
  --connect-to app.k8s-0139.fl.test::traefik.traefik-system.svc.cluster.local:80 \
  http://app.k8s-0139.fl.test/admin
```
