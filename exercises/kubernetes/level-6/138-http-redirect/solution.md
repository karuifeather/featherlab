# Solution

Edit HTTPRoute `web-route` and add a redirect rule for `/old` before the existing `/current` rule:

```bash
kubectl apply -n fl-k8s-0138 -f - <<'EOF'
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web-route
  namespace: fl-k8s-0138
spec:
  parentRefs:
    - name: web-gw
  hostnames:
    - "app.k8s-0138.fl.test"
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /old
      filters:
        - type: RequestRedirect
          requestRedirect:
            path:
              type: ReplaceFullPath
              value: /current
            statusCode: 301
    - matches:
        - path:
            type: PathPrefix
            value: /current
      backendRefs:
        - name: web
          port: 80
EOF
```

Verify the redirect returns HTTP 301 with the correct Location header:

```bash
kubectl exec grader-client -n fl-k8s-0138 -- \
  curl --silent --no-location \
  --connect-to app.k8s-0138.fl.test::traefik.traefik-system.svc.cluster.local:80 \
  -D - \
  http://app.k8s-0138.fl.test/old
# Expected: HTTP/1.1 301 ... Location: /current
```
