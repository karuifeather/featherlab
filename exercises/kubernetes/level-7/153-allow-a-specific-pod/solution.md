# Solution

A `default-deny` policy is already in place. Create `allow-frontend` to restore access for
Pods that carry the `role=frontend` label:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend
  namespace: fl-k8s-0153
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
              role: frontend
```

Apply it:

```bash
kubectl apply -f allow.yaml
```

Verify that `grader-client` (which has `role=frontend`) can reach the server:

```bash
kubectl exec grader-client -n fl-k8s-0153 -- wget -qO- http://api/
```

Expected: nginx welcome page.

Verify that `deny-client` (which does not have `role=frontend`) is still blocked:

```bash
kubectl exec deny-client -n fl-k8s-0153 -- curl -s --max-time 5 http://api/
```

Expected: timeout (curl exit 28).

**Key points:**

- `spec.podSelector.matchLabels.app: api` scopes the policy to the server Pod only. Pods
  without `app=api` are unaffected by this particular allow rule.
- `ingress[].from[].podSelector.matchLabels.role: frontend` matches clients in the same
  namespace. A Pod must carry the label at the time traffic is evaluated — labels are
  checked live, not cached.
- The `default-deny` policy stays in force. `allow-frontend` adds to it; it does not
  replace it. Any Pod without `role=frontend` is still denied by `default-deny`.
