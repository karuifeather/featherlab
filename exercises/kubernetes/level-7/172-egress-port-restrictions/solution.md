# Solution

Apply two egress policies: one for DNS, one for the api service.

**Step 1 — Allow DNS egress:**

```bash
kubectl apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns-egress
  namespace: fl-k8s-0172
spec:
  podSelector:
    matchLabels:
      app: deny-client
  policyTypes:
    - Egress
  egress:
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kube-system
          podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53
EOF
```

**Step 2 — Allow api egress:**

```bash
kubectl apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-api-egress
  namespace: fl-k8s-0172
spec:
  podSelector:
    matchLabels:
      app: deny-client
  policyTypes:
    - Egress
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: api
      ports:
        - protocol: TCP
          port: 80
EOF
```

Verify both policies are present:

```bash
kubectl get networkpolicy -n fl-k8s-0172
```

Expected output shows three policies: `deny-all-egress`, `allow-dns-egress`, `allow-api-egress`.

Test deny-client can now reach api:

```bash
kubectl exec deny-client -n fl-k8s-0172 -- \
  curl -s --max-time 10 http://api.fl-k8s-0172.svc.cluster.local:80/
echo "exit: $?"
```

Expected: nginx HTML response, exit 0.

## Key details

- **DNS needs both UDP and TCP port 53.** UDP is the default; TCP is the fallback for
  large responses. Allowing only UDP breaks certain DNS lookups silently.
- **`namespaceSelector + podSelector` in one `to` entry is AND logic.** Both conditions
  must match the same target. This is more precise than targeting the kube-dns ClusterIP
  with an `ipBlock`, which can vary across clusters.
- **`grader-client` has no egress restriction** and always passes the http-probe check
  regardless of what the learner does. The behavioral proof is the structural check —
  that both egress policies exist with the correct `policyTypes`.
