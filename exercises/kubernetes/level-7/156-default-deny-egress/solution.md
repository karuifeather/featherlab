# Solution

Create a NetworkPolicy that selects `deny-client` Pods and blocks all egress:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: deny-egress-client
  namespace: fl-k8s-0156
spec:
  podSelector:
    matchLabels:
      app: deny-client
  policyTypes:
    - Egress
```

Apply it:

```bash
kubectl apply -f deny-egress.yaml
```

Verify the policy:

```bash
kubectl describe networkpolicy deny-egress-client -n fl-k8s-0156
```

Test the block from `deny-client`:

```bash
kubectl exec deny-client -n fl-k8s-0156 -- \
  curl -s --max-time 8 http://api.fl-k8s-0156/
```

**Expected:** curl exits with code 6 — "curl: (6) Could not resolve host: api.fl-k8s-0156".

DNS (UDP port 53 to kube-dns) is outbound traffic. When all egress is denied, DNS
resolution fails before the TCP connection is ever attempted. This is why the exit
code is 6 ("couldn't resolve host"), not 28 ("operation timed out").

Compare this to an ingress block, where DNS works fine but the TCP handshake is
silently dropped (exit 28). Exit code 6 is the diagnostic signature of an egress
block that also denies DNS.

**Key points:**

- `policyTypes: [Egress]` without any `egress:` rules creates a default-deny for
  all outbound traffic, including DNS.
- The `podSelector` must match the `deny-client` Pod labels exactly.
- The `grader-client` Pod is not selected and is unaffected.
