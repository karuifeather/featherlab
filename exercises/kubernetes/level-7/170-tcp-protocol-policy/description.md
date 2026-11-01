# TCP and UDP Protocol Policies

## The `protocol` field in NetworkPolicy port rules

Every port entry in a NetworkPolicy rule can carry an optional `protocol` field:

```yaml
ports:
  - protocol: TCP # or UDP, or SCTP
    port: 80
```

When `protocol` is omitted, Kubernetes defaults to **TCP**. This means that most
NetworkPolicies you write implicitly restrict TCP traffic without ever stating it.

Making the protocol explicit has two benefits:

- It documents intent clearly, especially in environments where multiple protocols
  might be in use on the same port number.
- It lets you write separate rules for UDP and TCP on the same port (for example,
  DNS requires both UDP/53 and TCP/53).

## What changes when you specify `protocol: TCP`

Nothing behaviorally — the default is TCP. But the policy is unambiguous: it applies
only to TCP connections on port 80. A UDP datagram on port 80 from the same pod would
be subject only to other matching policies.

Contrast this with a policy that lists no `protocol`:

```yaml
# Equivalent to protocol: TCP
ports:
  - port: 80

# Explicit TCP
ports:
  - protocol: TCP
    port: 80

# Both UDP and TCP on port 53 (needed for DNS)
ports:
  - protocol: UDP
    port: 53
  - protocol: TCP
    port: 53
```

## The starting state

In namespace `fl-k8s-0170`:

- Pod `api` (nginx:1.27, label `app=api`) + Service `api` on port 80.
- Pod `grader-client` (busybox:1.36) with labels `app=grader-client` and **`role=allowed`**.
- Pod `deny-client` (curlimages/curl:8.10.1) with labels `app=deny-client` and **`role=blocked`**.
- NetworkPolicy `deny-all` already denies all ingress to `app=api`. Both clients are blocked.

## The task

Create NetworkPolicy `allow-role-allowed` in namespace `fl-k8s-0170` that:

1. Selects the `api` pod: `podSelector: {matchLabels: {app: "api"}}`
2. Allows ingress **only from pods with label `role=allowed`** on **TCP port 80**.
3. Explicitly sets `protocol: TCP` in the port rule.

After your policy is applied:

- `grader-client` (has `role=allowed`) can reach `api` on port 80.
- `deny-client` (has `role=blocked`) remains blocked.

**1. Write the NetworkPolicy manifest:**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-role-allowed
  namespace: fl-k8s-0170
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
              role: allowed
      ports:
        - protocol: TCP
          port: 80
```

**2. Apply it:**

```bash
kubectl apply -f allow-role-allowed.yaml
```

**3. Verify the policy exists:**

```bash
kubectl describe networkpolicy allow-role-allowed -n fl-k8s-0170
```

**4. Test connectivity manually (optional):**

```bash
# grader-client should succeed (wget exit 0)
kubectl exec grader-client -n fl-k8s-0170 -- \
  wget -qO- -T5 http://api.fl-k8s-0170.svc.cluster.local:80/

# deny-client should time out (curl exit 28)
kubectl exec deny-client -n fl-k8s-0170 -- \
  curl -s --max-time 5 http://api.fl-k8s-0170.svc.cluster.local:80/
```

## Reference

- [NetworkPolicy — ports and protocols](https://kubernetes.io/docs/concepts/services-networking/network-policies/#behavior-of-to-and-from-selectors)
- [NetworkPolicy spec](https://kubernetes.io/docs/reference/kubernetes-api/policy-resources/network-policy-v1/)
