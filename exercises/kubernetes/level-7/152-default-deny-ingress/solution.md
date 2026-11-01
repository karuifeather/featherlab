# Solution

Create a NetworkPolicy that selects all Pods and declares Ingress as a managed type with no
allow rules:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny
  namespace: fl-k8s-0152
spec:
  podSelector: {}
  policyTypes:
    - Ingress
```

Apply it:

```bash
kubectl apply -f deny.yaml
```

Verify the block (allow up to 5 seconds for kindnet to program the rules):

```bash
kubectl exec deny-client -n fl-k8s-0152 -- \
  curl -s --max-time 5 http://api/
```

Expected: the command times out (curl exit 28) — the connection is silently dropped.

Confirm the policy was accepted:

```bash
kubectl describe networkpolicy default-deny -n fl-k8s-0152
```

**Key points:**

- `podSelector: {}` selects every Pod in the namespace — if you set it to `matchLabels`,
  only the matching Pods are covered and others remain reachable.
- Including `Ingress` in `policyTypes` without any `ingress` rules is the standard
  default-deny pattern. The Kubernetes API accepts the omission of `spec.ingress` entirely.
- Both `grader-client` (wget) and `deny-client` (curl) are now blocked. The grader's
  `traffic-blocked` check uses `deny-client` because its label (`app: deny-client`) does not
  match any allow rule, proving the policy enforces isolation.
