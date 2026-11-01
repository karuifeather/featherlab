# Solution

Create `api-access-control` allowing only `role=monitor` pods on TCP port 80:

```bash
kubectl apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-access-control
  namespace: fl-k8s-0173
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
              role: monitor
      ports:
        - protocol: TCP
          port: 80
EOF
```

Verify the policy:

```bash
kubectl describe networkpolicy api-access-control -n fl-k8s-0173
```

Test the allowed path — grader-client (role=monitor) should succeed:

```bash
kubectl exec grader-client -n fl-k8s-0173 -- \
  wget -qO- -T5 http://api.fl-k8s-0173.svc.cluster.local:80/
```

Expected: nginx HTML response.

Test the denied path — deny-client (role=worker) should be blocked:

```bash
kubectl exec deny-client -n fl-k8s-0173 -- \
  curl -s --max-time 5 http://api.fl-k8s-0173.svc.cluster.local:80/
echo "exit: $?"
```

Expected: exit code 28 (TCP timeout).

## Why this is least privilege

`policyTypes: [Ingress]` with an `ingress:` rule creates a whitelist: only the
explicitly listed sources are allowed. Any pod that does not match `role=monitor`
(including `deny-client` which has `role=worker`, and any other pod without that label)
is silently dropped.

Before the policy existed, all traffic was allowed. After applying it, the allowed set
shrinks to exactly one label criterion. This is the essence of least-privilege access
control.
