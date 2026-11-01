# Default-Deny Egress

## What egress means

A NetworkPolicy's **ingress** rules control which traffic may enter a Pod.
**Egress** rules control which traffic the Pod itself may _send out_.

When you set `policyTypes: [Egress]` with no `egress:` rules, you create a
**default-deny egress** policy: the selected Pods are silenced — they cannot
initiate any outbound connection at all.

## DNS is outbound traffic too

An easy mistake is to assume that blocking egress only stops HTTP/TCP connections.
It does not. **DNS resolution is itself outbound traffic** — it is a UDP (and
sometimes TCP) request to port 53 on the cluster's DNS server (CoreDNS / kube-dns).

When a Pod has no egress rule for port 53:

- `curl http://api.fl-k8s-0156/` exits with **code 6** — "could not resolve host"
- The connection never even reaches the TCP layer

This is different from an ingress block, where the TCP handshake starts but the
packet is dropped (curl exits 28, timeout).

## Confirming both the server and the client are up

The grading system first verifies that the `api` Pod is Running and Ready before
asserting the block. A Pod that is simply crashed or missing does not count as
a successful NetworkPolicy denial.

## The task

A bare `api` Pod (nginx:1.27) and its Service are already running in namespace
`fl-k8s-0156`. A `deny-client` Pod (curlimages/curl) is also running; it can
reach `api` freely right now.

Create a NetworkPolicy named **`deny-egress-client`** that:

- Selects Pods with label `app=deny-client`
- Sets `policyTypes: [Egress]`
- Has **no** `egress:` rules (default-deny all outbound)

**1. Write the policy manifest** (`deny-egress.yaml`):

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

**2. Apply it:**

```bash
kubectl apply -f deny-egress.yaml
```

**3. Verify the policy was created:**

```bash
kubectl describe networkpolicy deny-egress-client -n fl-k8s-0156
```

**4. Confirm the block:**

```bash
kubectl exec deny-client -n fl-k8s-0156 -- \
  curl -s --max-time 8 http://api.fl-k8s-0156/
```

You should see an error — code 6 (DNS failure) or 28 (TCP timeout) — rather than
the nginx welcome page.

## What happens to grader-client?

The `grader-client` Pod in the same namespace is NOT selected by this policy
(`app=grader-client`, not `app=deny-client`). It can still reach `api` normally.
NetworkPolicy only restricts the Pods whose labels match the `podSelector`.

## Reference

- [NetworkPolicy egress rules](https://kubernetes.io/docs/concepts/services-networking/network-policies/#egress)
- [Default deny all egress traffic](https://kubernetes.io/docs/concepts/services-networking/network-policies/#default-deny-all-egress-traffic)
