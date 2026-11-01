# Solution

Create the `isolate-namespace` policy with both types and no rules:

```bash
kubectl apply -n fl-k8s-0163 -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: isolate-namespace
  namespace: fl-k8s-0163
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
EOF
```

Verify the policy is applied:

```bash
kubectl get networkpolicy isolate-namespace -n fl-k8s-0163
kubectl describe networkpolicy isolate-namespace -n fl-k8s-0163
# Spec:
#   PodSelector: <none> (Allowing the specific traffic to all pods in this namespace)
#   Allowing ingress traffic:
#     <none> (Selected pods are isolated for ingress connectivity)
#   Allowing egress traffic:
#     <none> (Selected pods are isolated for egress connectivity)
#   Policy Types: Ingress, Egress
```

Verify isolation — deny-client can no longer reach api (DNS blocked → exit 6):

```bash
kubectl exec deny-client -n fl-k8s-0163 -- \
  curl -s --max-time 5 http://api.fl-k8s-0163.svc.cluster.local/
# curl: (6) Could not resolve host: api.fl-k8s-0163.svc.cluster.local
# exit code: 6
```

## Why egress matters for DNS

Blocking egress on a pod also blocks its DNS queries. Kubernetes pods use the cluster's
CoreDNS for name resolution. With no egress rule allowing UDP/TCP port 53, the pod
cannot resolve any hostname — not just external ones. This is why `deny-client` gets
exit code 6 (can't resolve host) rather than 28 (timeout): DNS fails before the TCP
connection is even attempted.
