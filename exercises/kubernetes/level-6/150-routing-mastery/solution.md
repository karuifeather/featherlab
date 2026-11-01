# Solution: Level 6 Routing Mastery

## Task 1 — Fix the Ingress

```bash
kubectl patch ingress web-ingress -n fl-k8s-0150 --type=merge \
  -p '{"spec":{"ingressClassName":"traefik"}}'
```

Or edit manually and change `ingressClassName: nonexistent` to `ingressClassName: traefik`.

Verify:

```bash
kubectl get ingress web-ingress -n fl-k8s-0150 -o jsonpath='{.spec.ingressClassName}'
# → traefik
```

## Task 2 — Create the ReferenceGrant

Save this as `grant.yaml`:

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

Apply:

```bash
kubectl apply -f grant.yaml
```

Verify the HTTPRoute accepts the cross-namespace references:

```bash
kubectl describe httproute api-route -n fl-k8s-0150 | grep -E "Type|Status|Reason"
```

You should see `ResolvedRefs: True`.

## Task 3 — Update HTTPRoute weights

```bash
kubectl patch httproute api-route -n fl-k8s-0150 --type=merge -p '
spec:
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
'
```

## Full verification

```bash
# Ingress
kubectl get ingress web-ingress -n fl-k8s-0150

# ReferenceGrant
kubectl get referencegrant allow-httproute -n fl-k8s-0150-backend

# HTTPRoute conditions
kubectl get httproute api-route -n fl-k8s-0150 \
  -o jsonpath='{.status.parents[0].conditions[*].type}' && echo

# HTTPRoute backend weights
kubectl get httproute api-route -n fl-k8s-0150 \
  -o jsonpath='{.spec.rules[0].backendRefs[*]}' | python3 -m json.tool
```

## Key concepts reviewed

| Concept                      | Where used                                             |
| ---------------------------- | ------------------------------------------------------ |
| IngressClass selection       | Fix `ingressClassName: traefik` on the Ingress         |
| ReferenceGrant authorization | Allow HTTPRoute in ns-A to reference Services in ns-B  |
| Cross-namespace backendRefs  | `namespace:` field on each backendRef in the HTTPRoute |
| HTTPRoute weight splitting   | `weight: 80` / `weight: 20` for an 80/20 canary        |
