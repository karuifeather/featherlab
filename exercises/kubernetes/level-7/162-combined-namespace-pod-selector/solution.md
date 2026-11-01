# Solution

Create `allow-prod-frontend` with AND logic — both selectors in the same `from` entry:

```bash
kubectl apply -n fl-k8s-0162 -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-prod-frontend
  namespace: fl-k8s-0162
spec:
  podSelector: {}
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: fl-k8s-0162-client
          podSelector:
            matchLabels:
              role: frontend
EOF
```

Note the indentation: `podSelector` is at the same level as `namespaceSelector`, not
under a new `-`. They form a single `from` entry (AND logic).

Verify that authorized-client succeeds and unauthorized-client is blocked:

```bash
kubectl exec authorized-client -n fl-k8s-0162-client -- \
  wget -qO- -T5 http://api.fl-k8s-0162.svc.cluster.local/
# Expected: HTML page with "Welcome to nginx!"

kubectl exec unauthorized-client -n fl-k8s-0162-client -- \
  wget -qO- -T5 http://api.fl-k8s-0162.svc.cluster.local/
# Expected: timeout (wget exit 1/connection refused/timed out)
```

## The OR mistake

If you accidentally write two dashes:

```yaml
- from:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: fl-k8s-0162-client
    - podSelector: # ← separate entry = OR
        matchLabels:
          role: frontend
```

`unauthorized-client` would also be allowed because it is in `fl-k8s-0162-client`
(matching the namespaceSelector alone). This is the most common NetworkPolicy mistake.
