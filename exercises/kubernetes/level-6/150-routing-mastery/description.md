# Level 6 Routing Mastery

This challenge brings together everything from Level 6: Ingress configuration, Gateway API with cross-namespace routing, ReferenceGrants, and HTTPRoute traffic weighting. Three problems need fixing — work through them in order.

## Cluster state

Two namespaces are in play:

**`fl-k8s-0150`** (primary)

| Resource                        | Status                                             |
| ------------------------------- | -------------------------------------------------- |
| Deployment + Service `frontend` | Running                                            |
| Ingress `web-ingress`           | **BROKEN** — wrong `ingressClassName`              |
| Gateway `main-gw`               | Running, HTTP on `api.k8s-0150.fl.test`            |
| HTTPRoute `api-route`           | **BROKEN** — `RefNotPermitted` (no ReferenceGrant) |

**`fl-k8s-0150-backend`** (backend services)

| Resource                      | Status                            |
| ----------------------------- | --------------------------------- |
| Deployment + Service `api-v1` | Running, serves `"API version 1"` |
| Deployment + Service `api-v2` | Running, serves `"API version 2"` |
| ReferenceGrant                | **MISSING**                       |

## Your tasks

### Task 1 — Fix the Ingress

The Ingress for `web.k8s-0150.fl.test` uses `ingressClassName: nonexistent`. Change it to `traefik`:

```bash
kubectl edit ingress web-ingress -n fl-k8s-0150
```

Update:

```yaml
spec:
  ingressClassName: traefik # was: nonexistent
```

Verify with a describe or by checking the routing probe.

### Task 2 — Create the ReferenceGrant

The HTTPRoute `api-route` lives in `fl-k8s-0150` and references Services in `fl-k8s-0150-backend`. Without a ReferenceGrant in the target namespace, Gateway API refuses cross-namespace references as a security measure.

Create a ReferenceGrant **in `fl-k8s-0150-backend`** named `allow-httproute`:

```yaml
apiVersion: gateway.networking.k8s.io/v1beta1
kind: ReferenceGrant
metadata:
  name: allow-httproute
  namespace: fl-k8s-0150-backend
spec:
  from:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      namespace: fl-k8s-0150
  to:
    - group: ""
      kind: Service
```

Apply it:

```bash
kubectl apply -f referencegrant.yaml
```

After creating the grant, check that the HTTPRoute transitions from `RefNotPermitted` to `Accepted`:

```bash
kubectl describe httproute api-route -n fl-k8s-0150
```

### Task 3 — Set HTTPRoute weights

With the ReferenceGrant in place, update the HTTPRoute to route **80% to api-v1 and 20% to api-v2**:

```bash
kubectl edit httproute api-route -n fl-k8s-0150
```

Update the `backendRefs` weights:

```yaml
rules:
  - backendRefs:
      - name: api-v1
        namespace: fl-k8s-0150-backend
        port: 80
        weight: 80
      - name: api-v2
        namespace: fl-k8s-0150-backend
        port: 80
        weight: 20
```

## Checking your work

```bash
# Ingress
kubectl describe ingress web-ingress -n fl-k8s-0150

# ReferenceGrant
kubectl get referencegrant -n fl-k8s-0150-backend

# HTTPRoute status
kubectl describe httproute api-route -n fl-k8s-0150

# HTTPRoute weights
kubectl get httproute api-route -n fl-k8s-0150 -o yaml | grep -A8 backendRefs
```
