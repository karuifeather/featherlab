# Multi-Tier Connectivity

## The architecture

Namespace `fl-k8s-0169` has a two-tier application:

```
                   ┌──────────────┐     ┌──────────────┐
  All pods ──────▶ │   frontend   │────▶│   backend    │
                   └──────────────┘     └──────────────┘
  deny-client ─────────────────────────▶  ✗ (blocked)
```

- `frontend` is publicly accessible — any pod can reach it
- `backend` should only accept traffic from `frontend` — everything else is blocked

There are currently no NetworkPolicies. You need to create one.

```bash
kubectl get pods -n fl-k8s-0169 --show-labels
kubectl get networkpolicy -n fl-k8s-0169   # empty
```

## One policy is enough

When you create a NetworkPolicy for `backend` with `policyTypes: [Ingress]` and list
only `app: frontend` as an allowed source, the policy creates an implicit default-deny
for `backend`'s ingress — everything not in the allow list is blocked:

```yaml
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: frontend
```

`frontend` itself has no NetworkPolicy, so it remains open to all inbound traffic.

## Your task

Create a NetworkPolicy named `backend-access` in `fl-k8s-0169` that:

- Selects pods with `app: backend`
- Allows ingress from pods with `app: frontend`
- Uses `policyTypes: [Ingress]`

`deny-client` (app: deny-client) has no `app: frontend` label and will be blocked.

## Verify manually

```bash
# grader-client → frontend: should succeed (frontend has no NetworkPolicy)
kubectl exec grader-client -n fl-k8s-0169 -- \
  wget -qO- -T5 http://frontend.fl-k8s-0169.svc.cluster.local/

# deny-client → backend: should be blocked (timeout)
kubectl exec deny-client -n fl-k8s-0169 -- \
  curl -s --max-time 5 http://backend.fl-k8s-0169.svc.cluster.local/

# frontend → backend: should succeed (frontend pod has app=frontend)
kubectl exec frontend -n fl-k8s-0169 -- \
  wget -qO- -T5 http://backend.fl-k8s-0169.svc.cluster.local/
```
