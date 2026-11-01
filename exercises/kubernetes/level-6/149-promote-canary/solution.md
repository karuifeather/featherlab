# Solution: Promote the Canary

## Step 1 — Update HTTPRoute weights

```bash
kubectl patch httproute api-route -n fl-k8s-0149 --type=merge -p '
spec:
  rules:
    - backendRefs:
        - name: api-v1
          port: 80
          weight: 0
        - name: api-v2
          port: 80
          weight: 100
'
```

Or use `kubectl edit httproute api-route -n fl-k8s-0149` and update the `backendRefs` section to:

```yaml
backendRefs:
  - name: api-v1
    port: 80
    weight: 0
  - name: api-v2
    port: 80
    weight: 100
```

## Step 2 — Scale down api-v1

```bash
kubectl scale deployment api-v1 --replicas=0 -n fl-k8s-0149
```

## Verify

```bash
# Confirm route weights
kubectl get httproute api-route -n fl-k8s-0149 -o jsonpath='{.spec.rules[0].backendRefs}' | python3 -m json.tool

# Confirm Deployment is scaled to zero
kubectl get deployment api-v1 -n fl-k8s-0149

# Confirm HTTPRoute is still accepted
kubectl describe httproute api-route -n fl-k8s-0149 | grep -A5 "Conditions:"
```

## Key insights

- **weight: 0 is not the same as removing the backendRef.** A zero-weight backend is present in the route spec but receives no traffic. This is intentional: it preserves the reference so you can restore traffic by changing the weight without modifying the route structure.

- **Scaling to 0 replicas frees resources without deleting the Deployment.** The Deployment object, its rollout history, and its configuration are all preserved. A single `kubectl scale --replicas=2` restores capacity.

- **Rollback is a two-command operation:** `kubectl scale deployment api-v1 --replicas=2` then patch the route to give `api-v1` a non-zero weight.
