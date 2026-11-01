# Solution

`deny-all` and `allow-grader-a` are already in place. Add `allow-grader-b` to allow
`grader-client-b` without removing `allow-grader-a`:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-grader-b
  namespace: fl-k8s-0155
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
              app: grader-client-b
```

Apply it:

```bash
kubectl apply -f allow-b.yaml
```

Verify the union of all three policies:

```bash
# grader-client still works — allow-grader-a is still active
kubectl exec grader-client -n fl-k8s-0155 -- wget -qO- http://api/

# grader-client-b now works — allow-grader-b was added
kubectl exec grader-client-b -n fl-k8s-0155 -- wget -qO- http://api/

# deny-client is still blocked — no policy allows app=deny-client
kubectl exec deny-client -n fl-k8s-0155 -- curl -s --max-time 5 http://api/
```

List all policies to confirm all three exist:

```bash
kubectl get networkpolicies -n fl-k8s-0155
```

Expected output: three policies — `deny-all`, `allow-grader-a`, `allow-grader-b`.

**Key points:**

- Policies are additive. Adding `allow-grader-b` does not affect `allow-grader-a` or
  `deny-all`; it contributes additional allowed sources.
- `deny-client` (label `app=deny-client`) is not matched by either allow policy and
  remains blocked by `deny-all`.
- The common mistake is deleting `allow-grader-a` and creating only `allow-grader-b`. This
  permanently removes `grader-client`'s access: without `allow-grader-a`, it is blocked by
  `deny-all` and `http-probe-a` fails in the grader.
