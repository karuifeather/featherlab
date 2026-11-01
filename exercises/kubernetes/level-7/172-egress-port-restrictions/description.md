# Egress with Port Restrictions

## Why egress policies are harder than ingress

An egress policy controls what a Pod is **allowed to send to**. The common trap is
forgetting DNS: almost every practical connection starts with a DNS lookup.

When you apply a default-deny egress policy, DNS is blocked too. The client Pod
gets `curl exit 6` (couldn't resolve host) even before attempting the TCP connection.
You must **explicitly allow egress to the DNS server** as part of any least-privilege
egress policy.

## DNS egress: what to allow

CoreDNS listens on **both UDP port 53 and TCP port 53**. DNS normally uses UDP, but
falls back to TCP for large responses. A correct DNS egress rule must allow both:

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

Using a `namespaceSelector + podSelector` combination (AND logic within a single `to`
entry) targets only CoreDNS pods in `kube-system`. This is portable — it does not
depend on the kube-dns ClusterIP, which can change across clusters.

## Service egress: what to allow

After DNS is restored, the Pod needs egress permission to the target Service's IP.
The simplest form targets pods by label using a `podSelector` within the same
namespace:

```yaml
egress:
  - to:
      - podSelector:
          matchLabels:
            app: api
    ports:
      - protocol: TCP
        port: 80
```

## The starting state

In namespace `fl-k8s-0172`:

- Pod `api` (nginx:1.27, `app=api`) + Service `api` on port 80.
- Pod `grader-client` (busybox:1.36) — no egress restriction, can always reach `api`.
- Pod `deny-client` (curlimages/curl:8.10.1, `app=deny-client`) — ALL egress is blocked
  by the pre-existing NetworkPolicy `deny-all-egress`.

## The task

Create **two** NetworkPolicies to restore outbound connectivity for `deny-client`:

**1. `allow-dns-egress`** — allows `deny-client` to reach CoreDNS on UDP+TCP port 53:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns-egress
  namespace: fl-k8s-0172
spec:
  podSelector:
    matchLabels:
      app: deny-client
  policyTypes:
    - Egress
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

**2. `allow-api-egress`** — allows `deny-client` to reach `app=api` on TCP port 80:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-api-egress
  namespace: fl-k8s-0172
spec:
  podSelector:
    matchLabels:
      app: deny-client
  policyTypes:
    - Egress
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: api
      ports:
        - protocol: TCP
          port: 80
```

**Apply both:**

```bash
kubectl apply -f allow-dns-egress.yaml
kubectl apply -f allow-api-egress.yaml
```

**Verify:**

```bash
kubectl get networkpolicy -n fl-k8s-0172
```

You should see `deny-all-egress`, `allow-dns-egress`, and `allow-api-egress`.

**Test deny-client connectivity (optional, needs curl):**

```bash
kubectl exec deny-client -n fl-k8s-0172 -- \
  curl -s --max-time 10 http://api.fl-k8s-0172.svc.cluster.local:80/
```

After both policies are applied, this should succeed (exit 0, nginx response).

## Reference

- [NetworkPolicy egress](https://kubernetes.io/docs/concepts/services-networking/network-policies/#egress)
- [DNS for Services and Pods](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/)
