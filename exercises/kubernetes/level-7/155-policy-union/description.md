# NetworkPolicy Union — Multiple Policies

## How multiple NetworkPolicies combine

When more than one NetworkPolicy selects the same Pod, their rules are **unioned** (logical OR).
Each policy contributes allowed sources independently — they do not intersect or override each
other. A connection is allowed if _any_ applicable policy permits it.

```
deny-all       (podSelector: {}, no ingress rules) → blocks by default
allow-grader-a (from app=grader-client)            → adds: grader-client is allowed
allow-grader-b (from app=grader-client-b)          → adds: grader-client-b is allowed
────────────────────────────────────────────────────────────────────────────────────────
Effective:  grader-client ✓  |  grader-client-b ✓  |  deny-client ✗
```

This additive model means:

- **Adding** a new policy never blocks something that was previously allowed.
- **Removing** a policy may expose traffic that was previously blocked by that policy alone.
- **Replacing** `allow-grader-a` with a combined policy is equivalent to having both policies,
  but it is fragile — if you forget to include one source, you block it.

## The task

Namespace `fl-k8s-0155` already has:

- `deny-all` — blocks all ingress to every Pod.
- `allow-grader-a` — allows ingress from Pods with `app=grader-client`.

Three client Pods are running:

| Pod               | Label                 | Status                                 |
| ----------------- | --------------------- | -------------------------------------- |
| `grader-client`   | `app=grader-client`   | already allowed by `allow-grader-a`    |
| `grader-client-b` | `app=grader-client-b` | blocked — no allow policy yet          |
| `deny-client`     | `app=deny-client`     | must remain blocked after you are done |

Add a NetworkPolicy named `allow-grader-b` that allows ingress from Pods with `app=grader-client-b`.
Do **not** delete or modify `allow-grader-a`.

**1. Confirm the current state before making changes:**

```bash
# grader-client should work (allowed by allow-grader-a)
kubectl exec grader-client -n fl-k8s-0155 -- wget -qO- http://api/

# grader-client-b should be blocked
kubectl exec grader-client-b -n fl-k8s-0155 -- wget -qO- -T 5 http://api/
```

**2. Write the manifest** (`allow-b.yaml`):

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

**3. Apply it:**

```bash
kubectl apply -f allow-b.yaml
```

**4. Verify the union:**

```bash
# grader-client: still works (allow-grader-a is still active)
kubectl exec grader-client -n fl-k8s-0155 -- wget -qO- http://api/

# grader-client-b: now works (allow-grader-b was added)
kubectl exec grader-client-b -n fl-k8s-0155 -- wget -qO- http://api/

# deny-client: still blocked (neither policy allows app=deny-client)
kubectl exec deny-client -n fl-k8s-0155 -- curl -s --max-time 5 http://api/
```

**5. Inspect all three policies:**

```bash
kubectl get networkpolicies -n fl-k8s-0155
```

## A note on equivalence

Two separate policies are equivalent to one policy with two `from` entries:

```yaml
# This is equivalent to having both allow-grader-a and allow-grader-b
ingress:
  - from:
      - podSelector:
          matchLabels:
            app: grader-client
  - from:
      - podSelector:
          matchLabels:
            app: grader-client-b
```

The separate-policy approach is often preferred in practice because each policy can be
managed, audited, and deleted independently.

## Reference

- [NetworkPolicy — behavior with multiple policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/#the-two-sorts-of-pod-isolation)
