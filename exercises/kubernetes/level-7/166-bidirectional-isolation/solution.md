# Solution

Create `isolate-client` targeting only the `client` pod:

```bash
kubectl apply -n fl-k8s-0166 -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: isolate-client
  namespace: fl-k8s-0166
spec:
  podSelector:
    matchLabels:
      app: client
  policyTypes:
    - Ingress
    - Egress
EOF
```

Verify:

```bash
kubectl describe networkpolicy isolate-client -n fl-k8s-0166
# Spec:
#   PodSelector: app=client
#   Allowing ingress traffic:
#     <none> (Selected pods are isolated for ingress connectivity)
#   Allowing egress traffic:
#     <none> (Selected pods are isolated for egress connectivity)
#   Policy Types: Ingress, Egress
```

Test the isolated `client` pod (exit 6 = DNS blocked):

```bash
kubectl exec client -n fl-k8s-0166 -- \
  curl -s -o /dev/null -w "%{exit_code}" --max-time 5 \
  http://api.fl-k8s-0166.svc.cluster.local/
# 6  (couldn't resolve host)
```

Test that `grader-client` is unaffected:

```bash
kubectl exec grader-client -n fl-k8s-0166 -- \
  wget -qO- -T5 http://api.fl-k8s-0166.svc.cluster.local/
# Welcome to nginx!
```

## Key differences from namespace isolation

|                        | k8s-0163 (namespace isolation) | k8s-0166 (pod isolation)       |
| ---------------------- | ------------------------------ | ------------------------------ |
| podSelector            | `{}` (all pods)                | `{matchLabels: {app: client}}` |
| Scope                  | Every pod in the namespace     | Only matching pods             |
| grader-client affected | Yes                            | No                             |
