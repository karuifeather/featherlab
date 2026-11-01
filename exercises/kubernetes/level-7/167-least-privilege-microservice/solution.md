# Solution

Create `api-least-privilege` with both ingress and egress rules:

```bash
kubectl apply -n fl-k8s-0167 -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-least-privilege
  namespace: fl-k8s-0167
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
              app: grader-client
      ports:
        - protocol: TCP
          port: 80
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: db
      ports:
        - protocol: TCP
          port: 5432
EOF
```

Verify:

```bash
kubectl describe networkpolicy api-least-privilege -n fl-k8s-0167
```

Test ingress — grader-client allowed, deny-client blocked:

```bash
# Allowed (TCP conntrack handles response even though egress is restricted):
kubectl exec grader-client -n fl-k8s-0167 -- \
  wget -qO- -T5 http://api.fl-k8s-0167.svc.cluster.local/
# Welcome to nginx!

# Blocked (exit 28 — ingress rule doesn't match deny-client):
kubectl exec deny-client -n fl-k8s-0167 -- \
  curl -s --max-time 5 http://api.fl-k8s-0167.svc.cluster.local/
```

## How responses work with egress restrictions

The `api` pod has default-deny egress (only db:5432 is allowed). When `grader-client`
connects, the kernel's connection tracking (conntrack) marks the connection as
ESTABLISHED. TCP reply packets from `api` back to `grader-client` are part of that
established connection and are allowed by conntrack regardless of the egress policy.

New outbound connections from `api` (including DNS queries) are blocked. If `api`
needed to resolve hostnames, you would add a DNS egress rule.
