# Allow DNS Egress

## The problem: DNS is blocked too

The `deny-client` Pod in namespace `fl-k8s-0157` already has a `deny-egress-client`
policy that blocks all outbound traffic. Before you can allow it to reach any Service
by hostname, you must **explicitly permit DNS resolution**.

DNS works by sending a UDP (or TCP) query to port 53 on the cluster DNS server —
**CoreDNS** — which runs as the `kube-dns` Service in the `kube-system` namespace.
Without an egress rule that allows this traffic, every `curl http://...` attempt
fails at the DNS step with exit code 6 before the TCP connection is even attempted.

## Finding the kube-dns ClusterIP

A NetworkPolicy egress rule can target a specific IP with `ipBlock`. You need the
ClusterIP of the `kube-dns` Service:

```bash
kubectl get svc kube-dns -n kube-system -o jsonpath='{.spec.clusterIP}'
```

In a standard kind cluster this is **`10.96.0.10`**. A hint in the `cluster-info`
ConfigMap confirms this value for this exercise.

## The exit-code shift

After you allow DNS (port 53) but before you allow TCP to `api`, something changes:

| Before `allow-dns`                         | After `allow-dns`              |
| ------------------------------------------ | ------------------------------ |
| DNS query blocked                          | DNS query succeeds             |
| curl exit **6** — "could not resolve host" | curl exit **28** — TCP timeout |

Exit code 28 means DNS resolved the hostname successfully, but the TCP packet to
port 80 on `api` was silently dropped. That is expected at this stage — you are
restoring DNS resolution only. Full connectivity requires a second egress rule
(the next exercise).

## The task

Create a NetworkPolicy named **`allow-dns`** that allows the `deny-client` Pod to
send DNS queries to the kube-dns Service IP (`10.96.0.10`) on both UDP and TCP
port 53.

**1. Write the manifest** (`allow-dns.yaml`):

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

**2. Apply it:**

```bash
kubectl apply -f allow-dns.yaml
```

**3. Verify DNS now resolves:**

```bash
kubectl exec deny-client -n fl-k8s-0157 -- \
  nslookup api.fl-k8s-0157
```

You should receive a DNS answer. However, TCP to port 80 is still blocked.

**4. Confirm TCP is still blocked:**

```bash
kubectl exec deny-client -n fl-k8s-0157 -- \
  curl -s --max-time 8 http://api.fl-k8s-0157/
```

Expected: exit 28 (timeout) instead of exit 6. DNS works; TCP does not yet.

## `ipBlock` vs. `namespaceSelector` for kube-dns

The manifest above uses `ipBlock: {cidr: 10.96.0.10/32}`. This works on this
cluster's kindnet CNI (verified in the environment proof test), but the
Kubernetes documentation notes that `ipBlock` is primarily intended for
cluster-external IPs. Whether ClusterIP traffic matches before or after DNAT is
implementation-defined and varies by CNI.

The more portable form targets the CoreDNS Pod directly by label rather than by
ClusterIP:

```yaml
egress:
  - to:
      - namespaceSelector:
          matchLabels:
            kubernetes.io/metadata.name: kube-system
        podSelector:
          matchLabels:
            k8s-app: kube-dns
    ports:
      - protocol: UDP
        port: 53
      - protocol: TCP
        port: 53
```

This exercise uses `ipBlock` for simplicity. Prefer the label-based form in
production policies.

## Reference

- [NetworkPolicy egress rules](https://kubernetes.io/docs/concepts/services-networking/network-policies/#egress)
- [CoreDNS](https://kubernetes.io/docs/tasks/administer-cluster/coredns/)
