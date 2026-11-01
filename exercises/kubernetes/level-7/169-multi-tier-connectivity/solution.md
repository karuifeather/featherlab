# Solution

Create `backend-access` to restrict backend ingress to pods with `app: frontend`:

```bash
kubectl apply -n fl-k8s-0169 -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: backend-access
  namespace: fl-k8s-0169
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
EOF
```

Verify the policy:

```bash
kubectl describe networkpolicy backend-access -n fl-k8s-0169
```

Test frontend is still open to all:

```bash
kubectl exec grader-client -n fl-k8s-0169 -- \
  wget -qO- -T5 http://frontend.fl-k8s-0169.svc.cluster.local/
# Welcome to nginx!
```

Test that deny-client cannot reach backend directly:

```bash
kubectl exec deny-client -n fl-k8s-0169 -- \
  curl -s --max-time 5 http://backend.fl-k8s-0169.svc.cluster.local/
# (times out — exit 28)
```

Test that frontend can reach backend (frontend pod has `app: frontend`):

```bash
kubectl exec frontend -n fl-k8s-0169 -- \
  wget -qO- -T5 http://backend.fl-k8s-0169.svc.cluster.local/
# Welcome to nginx!
```

## Why only one policy is needed

Creating a NetworkPolicy for `backend` with `policyTypes: [Ingress]` automatically
creates a default-deny for all ingress to `backend`. Only the pods explicitly listed
in the ingress rules are allowed. The policy applies only to `backend` (via
`podSelector`), so `frontend` remains unrestricted.

This is the correct pattern for protecting an internal tier: declare the target, declare
who is allowed, and let the default-deny handle everything else.
