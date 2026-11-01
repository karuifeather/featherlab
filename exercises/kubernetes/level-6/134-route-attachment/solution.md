# Solution

Edit the HTTPRoute and change the `parentRefs` name:

```bash
kubectl edit httproute web-route -n fl-k8s-0134
```

Change this:

```yaml
spec:
  parentRefs:
    - name: wrong-gw
```

To this:

```yaml
spec:
  parentRefs:
    - name: main-gw
```

**Declarative approach:**

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: web-route
  namespace: fl-k8s-0134
spec:
  parentRefs:
    - name: main-gw
  hostnames:
    - "app.k8s-0134.fl.test"
  rules:
    - backendRefs:
        - name: web
          port: 80
```

```bash
kubectl apply -f web-route.yaml
```

## Verify

```bash
kubectl describe httproute web-route -n fl-k8s-0134
```

The status should show a parent entry for `main-gw` with `Accepted: True` and
`ResolvedRefs: True`.

```bash
kubectl exec -n fl-k8s-0134 grader-client -- \
  curl -s -H "Host: app.k8s-0134.fl.test" \
  http://traefik.traefik-system.svc.cluster.local/
```

The nginx welcome page confirms traffic is now routed correctly.
