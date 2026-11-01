# Solution

Create an HTTPRoute for the v2 hostname:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: v2-route
  namespace: fl-k8s-0132
spec:
  parentRefs:
    - name: web-gw
  hostnames:
    - "v2.k8s-0132.fl.test"
  rules:
    - backendRefs:
        - name: v2
          port: 80
```

Apply it:

```bash
kubectl apply -f v2-route.yaml
```

## Verify

```bash
kubectl describe httproute v2-route -n fl-k8s-0132
```

Both routes should now work:

```bash
kubectl exec -n fl-k8s-0132 grader-client -- \
  curl -s -H "Host: v1.k8s-0132.fl.test" \
  http://traefik.traefik-system.svc.cluster.local/
# → v1

kubectl exec -n fl-k8s-0132 grader-client -- \
  curl -s -H "Host: v2.k8s-0132.fl.test" \
  http://traefik.traefik-system.svc.cluster.local/
# → v2
```

The Gateway's wildcard listener `*.k8s-0132.fl.test` accepts both routes automatically.
No changes to the Gateway are needed.
