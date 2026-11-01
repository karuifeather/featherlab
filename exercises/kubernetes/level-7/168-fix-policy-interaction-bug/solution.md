# Solution: Fix a Policy Interaction Bug

## Diagnosis

Inspect the broken policy:

```bash
kubectl get networkpolicy allow-frontend-buggy -n fl-k8s-0168 -o yaml
```

You will see:

```yaml
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes:
    - Egress # <-- BUG: Ingress is missing
  ingress:
    - from:
        - podSelector:
            matchLabels:
              role: frontend
```

The `ingress` rules are written, but `policyTypes` only lists `Egress`. Because `Ingress` is absent from `policyTypes`, Kubernetes does not enforce the ingress rules — both clients can freely reach `api`.

## Fix

Apply the corrected policy with `Ingress` added to `policyTypes`:

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

With `Ingress` in `policyTypes`, the ingress rule now takes effect. Since only `role=frontend` is listed in `from`, any pod without that label is implicitly denied ingress to `api`.

## Verify

```bash
# grader-client (role=frontend) should now reach api
kubectl exec grader-client -n fl-k8s-0168 -- wget -qO- http://api.fl-k8s-0168.svc.cluster.local/
# Expected: nginx welcome page HTML

# deny-client (no role=frontend) should be blocked
kubectl exec deny-client -n fl-k8s-0168 -- \
  curl -s --max-time 5 http://api.fl-k8s-0168.svc.cluster.local/
# Expected: timeout (exit 28)
```
