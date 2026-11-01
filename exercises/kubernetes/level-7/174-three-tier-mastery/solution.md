# Solution

Apply three NetworkPolicies, one per tier:

**Tier 1 — frontend open to all internal clients:**

```bash
kubectl apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: frontend-open
  namespace: fl-k8s-0174
spec:
  podSelector:
    matchLabels:
      app: frontend
  policyTypes:
    - Ingress
  ingress:
    - ports:
        - protocol: TCP
          port: 80
EOF
```

**Tier 2 — api accessible only from frontend:**

```bash
kubectl apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-from-frontend
  namespace: fl-k8s-0174
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: frontend
      ports:
        - protocol: TCP
          port: 80
EOF
```

**Tier 3 — db accessible only from api:**

```bash
kubectl apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: db-from-api
  namespace: fl-k8s-0174
spec:
  podSelector:
    matchLabels:
      app: db
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: api
      ports:
        - protocol: TCP
          port: 80
EOF
```

Verify all three policies:

```bash
kubectl get networkpolicy -n fl-k8s-0174
```

Expected: three policies — `frontend-open`, `api-from-frontend`, `db-from-api`.

Test `grader-client` reaches `frontend`:

```bash
kubectl exec grader-client -n fl-k8s-0174 -- \
  wget -qO- -T5 http://frontend.fl-k8s-0174.svc.cluster.local:80/
```

Expected: nginx HTML response (exit 0).

Test `deny-client` is blocked from `api`:

```bash
kubectl exec deny-client -n fl-k8s-0174 -- \
  curl -s --max-time 5 http://api.fl-k8s-0174.svc.cluster.local:80/
echo "exit: $?"
```

Expected: exit 28 (TCP timeout — only `frontend` pod is allowed by `api-from-frontend`).

## Key design points

- `frontend-open` uses a `ports` entry with no `from:` selector — this allows any pod
  in the namespace to send TCP port 80 traffic to frontend. This is the "public" tier.
- `api-from-frontend` explicitly names `app=frontend` in its `from:` selector. Any pod
  without that label (including `deny-client`, `grader-client`, `db`) is blocked.
- `db-from-api` does the same for the database tier.
- All three policies use only `policyTypes: [Ingress]`, so egress is unrestricted for
  all pods. A production system would also add egress policies.
