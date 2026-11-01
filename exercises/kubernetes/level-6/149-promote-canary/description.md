# Promote the Canary

The canary deployment of `api-v2` has proven stable. It is time to complete the rollout: promote `api-v2` to receive 100% of traffic, and decommission `api-v1`.

## What is already running

| Resource              | Description                              |
| --------------------- | ---------------------------------------- |
| Deployment `api-v1`   | Version 1, 2 replicas, nginx 1.27        |
| Deployment `api-v2`   | Version 2, 2 replicas, nginx 1.27        |
| Service `api-v1`      | Port 80, selects v1 pods                 |
| Service `api-v2`      | Port 80, selects v2 pods                 |
| Gateway `api-gw`      | HTTP listener for `api.k8s-0149.fl.test` |
| HTTPRoute `api-route` | Currently **50% api-v1 / 50% api-v2**    |

## Your task

Perform a complete canary promotion with rollback capability preserved:

### Step 1 — Shift traffic to api-v2

Edit the HTTPRoute and update the weights:

- `api-v2`: weight **100**
- `api-v1`: weight **0** (keep the backendRef — it enables instant rollback)

```bash
kubectl edit httproute api-route -n fl-k8s-0149
```

Setting a backend's weight to 0 (rather than deleting it) means you can restore traffic to `api-v1` immediately if a problem is discovered — just flip the weight back without rewriting the whole route.

### Step 2 — Scale down api-v1

With traffic fully shifted, the old version's pods are no longer serving requests. Scale them to zero to free up cluster resources:

```bash
kubectl scale deployment api-v1 --replicas=0 -n fl-k8s-0149
```

## Why two separate steps?

Setting `weight: 0` removes traffic but keeps the pods running. Scaling the Deployment to 0 stops the pods but leaves the backendRef intact. Doing both gives you a clean promotion where:

- No requests reach `api-v1` (weight 0)
- No pods are wasting resources (`spec.replicas: 0`)
- Rollback is still one command away (set `api-v1` weight back to non-zero)

## Verify

```bash
kubectl get httproute api-route -n fl-k8s-0149 -o yaml | grep -A5 backendRefs
kubectl get deployment api-v1 -n fl-k8s-0149
```

The HTTPRoute should show `api-v2` at weight 100 and `api-v1` at weight 0. The Deployment should show `0/0` under READY.
