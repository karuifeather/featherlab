# Solution

Create the `allow-role-allowed` NetworkPolicy with an explicit `protocol: TCP` port rule:

```bash
kubectl apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-role-allowed
  namespace: fl-k8s-0170
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
              role: allowed
      ports:
        - protocol: TCP
          port: 80
EOF
```

Verify the policy is present:

```bash
kubectl get networkpolicy -n fl-k8s-0170
kubectl describe networkpolicy allow-role-allowed -n fl-k8s-0170
```

Test that `grader-client` (role=allowed) reaches the API:

```bash
kubectl exec grader-client -n fl-k8s-0170 -- \
  wget -qO- -T5 http://api.fl-k8s-0170.svc.cluster.local:80/
```

Expected: HTML response from nginx.

Test that `deny-client` (role=blocked) is still blocked:

```bash
kubectl exec deny-client -n fl-k8s-0170 -- \
  curl -s --max-time 5 http://api.fl-k8s-0170.svc.cluster.local:80/
echo "exit: $?"
```

Expected: curl exits with code 28 (connection timed out — NetworkPolicy drops the TCP SYN).

## Why this works

The `deny-all` policy (from setup) selects `app=api` with `policyTypes: [Ingress]` and
no ingress rules — this creates a default-deny for ALL ingress to the api pod.

The `allow-role-allowed` policy adds a positive rule: admit TCP port 80 traffic from
pods labeled `role=allowed`. NetworkPolicies union together, so the api pod now has
two policies selecting it: one that denies everything and one that allows the specific
source. The allow wins for that source only.

`deny-client` (role=blocked) matches neither the `deny-all` allow (there is none) nor
the `allow-role-allowed` rule's from selector, so its traffic is still dropped.
