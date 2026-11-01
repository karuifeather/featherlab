# Solution

Create `allow-from-frontend` using the automatic `kubernetes.io/metadata.name` label:

```bash
kubectl apply -n fl-k8s-0165 -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-from-frontend
  namespace: fl-k8s-0165
spec:
  podSelector: {}
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: fl-k8s-0165-frontend
EOF
```

Verify:

```bash
kubectl get networkpolicy -n fl-k8s-0165
# NAME                 POD-SELECTOR   AGE
# allow-from-frontend  <none>         3s
# deny-all             <none>         ...
```

Test frontend (should succeed):

```bash
kubectl exec frontend-client -n fl-k8s-0165-frontend -- \
  wget -qO- -T5 http://api.fl-k8s-0165.svc.cluster.local/
# Welcome to nginx!
```

Test backend (should time out — ingress rule only matches frontend namespace):

```bash
kubectl exec backend-client -n fl-k8s-0165-backend -- \
  wget -qO- -T5 http://api.fl-k8s-0165.svc.cluster.local/
# wget: download timed out / can't connect
```

## Grading note

The graded block check uses `deny-client` in `fl-k8s-0165` (same namespace as `api`),
not `backend-client`. The validator currently only tests same-namespace blocking. You
can verify the cross-namespace block manually with `backend-client` as shown above.
