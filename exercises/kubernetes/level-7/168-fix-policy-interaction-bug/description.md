# Fix a Policy Interaction Bug

A NetworkPolicy named `allow-frontend-buggy` exists in namespace `fl-k8s-0168`. It intends to allow ingress to `api` from pods with `role=frontend` while blocking all other sources. But something is wrong — both `grader-client` (which has `role=frontend`) and `deny-client` can still reach `api` without restriction.

## Your task

1. Inspect the broken policy and identify why the ingress rules are not being enforced.
2. Fix the policy so that:
   - `grader-client` (role=frontend) **can** reach `api`
   - `deny-client` **cannot** reach `api`

## Background: `policyTypes` controls what Kubernetes enforces

A NetworkPolicy's `policyTypes` field tells Kubernetes which traffic directions this policy governs:

- `policyTypes: [Ingress]` — Kubernetes enforces ingress rules; egress is unrestricted
- `policyTypes: [Egress]` — Kubernetes enforces egress rules; **ingress rules in the same policy are silently ignored**
- `policyTypes: [Ingress, Egress]` — both directions are governed

When a NetworkPolicy has `ingress` rules but `policyTypes` does not include `Ingress`, those ingress rules **do nothing**. The policy is syntactically valid and Kubernetes accepts it without error — there is no warning.

## Diagnose

```bash
# Inspect the existing policy
kubectl get networkpolicy allow-frontend-buggy -n fl-k8s-0168 -o yaml

# Look at the policyTypes field — what's listed?
# Then look at what ingress rules are defined.
```

The discrepancy between `policyTypes` and the presence of ingress rules is the bug.

## Fix

Add `Ingress` to the `policyTypes` list. When `Ingress` is present in `policyTypes`, the ingress rules take effect and implicitly deny all ingress that is not explicitly allowed — so `deny-client` (no `role=frontend` label) will be blocked.

```bash
kubectl apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-buggy
  namespace: fl-k8s-0168
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              role: frontend
EOF
```

## Verify

```bash
# grader-client (role=frontend) should succeed
kubectl exec grader-client -n fl-k8s-0168 -- wget -qO- http://api.fl-k8s-0168.svc.cluster.local/

# deny-client should be blocked (timeout or refused)
kubectl exec deny-client -n fl-k8s-0168 -- \
  curl -s --max-time 5 http://api.fl-k8s-0168.svc.cluster.local/
```

## Key insight

`policyTypes` is a **declaration of intent**, not an inference. Even if you write ingress rules, Kubernetes will not enforce them unless `policyTypes` includes `Ingress`. When debugging unexpected open access, always check whether the relevant type is declared in `policyTypes`.
