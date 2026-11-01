# Solution

Create a NetworkPolicy that allows the `deny-client` Pod to query kube-dns on
port 53 (both UDP and TCP):

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns
  namespace: fl-k8s-0157
spec:
  podSelector:
    matchLabels:
      app: deny-client
  policyTypes:
    - Egress
  egress:
    - to:
        - ipBlock:
            cidr: 10.96.0.10/32
      ports:
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53
```

Apply it:

```bash
kubectl apply -f allow-dns.yaml
```

Discover the kube-dns IP at any time:

```bash
kubectl get svc kube-dns -n kube-system -o jsonpath='{.spec.clusterIP}'
```

Verify DNS resolution works:

```bash
kubectl exec deny-client -n fl-k8s-0157 -- nslookup api.fl-k8s-0157
```

Confirm that TCP to `api` is still blocked (expected at this stage):

```bash
kubectl exec deny-client -n fl-k8s-0157 -- \
  curl -s --max-time 8 http://api.fl-k8s-0157/
```

**Expected output:** curl exits with code 28 — "Operation timed out" — not code 6.
This confirms DNS resolves (`allow-dns` works) but TCP port 80 is still dropped
(no egress rule for the server yet).

**Key points:**

- DNS is UDP/TCP port 53 from the Pod to the kube-dns ClusterIP.
- The exit-code shift from 6 to 28 is the observable proof that DNS is now
  permitted while TCP to the destination remains blocked.
- Both UDP and TCP port 53 must be allowed — some DNS responses use TCP for
  large records and zone transfers.
- `10.96.0.10/32` targets only the kube-dns Service IP, not all of `kube-system`.
