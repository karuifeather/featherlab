# Allow Egress to a Specific Service

## Where things stand

In namespace `fl-k8s-0158`, the `deny-client` Pod has two existing NetworkPolicies:

| Policy               | Effect                                       |
| -------------------- | -------------------------------------------- |
| `deny-egress-client` | Blocks ALL egress from `app=deny-client`     |
| `allow-dns`          | Allows egress to `10.96.0.10:53` (UDP + TCP) |

NetworkPolicy rules are **additive** (union): having two `Egress` policies means
the union of their egress rules applies. `deny-client` can now resolve DNS, but
TCP to `api` on port 80 is still dropped — there is no egress rule for it yet.

## Targeting server Pods by label

An egress `to` entry can target Pods by their labels, just like an ingress `from`
entry. The selector lives under `to[].podSelector`:

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

This tells the CNI: "allow TCP port 80 outbound to any Pod in the same namespace
that carries `app=api`."

## DNS + destination = full connectivity

After applying both `allow-dns` and `allow-api-egress`, the `deny-client` Pod
can:

1. Query kube-dns on port 53 (UDP/TCP) → resolve `api.fl-k8s-0158`
2. Open a TCP connection to the resolved IP on port 80 → reach nginx

The `grader-client` Pod has no egress policy at all and can always reach `api`.
The HTTP probe in this exercise uses `grader-client` to verify the server is up.

## The task

Create a NetworkPolicy named **`allow-api-egress`** that permits egress from
`app=deny-client` Pods to `app=api` Pods on TCP port 80.

**1. Write the manifest** (`allow-api-egress.yaml`):

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-api-egress
  namespace: fl-k8s-0158
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

**2. Apply it:**

```bash
kubectl apply -f allow-api-egress.yaml
```

**3. Verify connectivity from the unrestricted client:**

```bash
kubectl exec grader-client -n fl-k8s-0158 -- \
  wget -qO- -T5 http://api.fl-k8s-0158:80/
```

You should see the nginx welcome page.

**4. Check that deny-client can also now reach api:**

```bash
kubectl exec deny-client -n fl-k8s-0158 -- \
  curl -s --max-time 8 http://api.fl-k8s-0158/
```

Expected: HTTP 200 (nginx welcome page).

## Viewing all policies in the namespace

```bash
kubectl get networkpolicies -n fl-k8s-0158
```

You should see three policies: `deny-egress-client`, `allow-dns`, and your new
`allow-api-egress`.

## Reference

- [NetworkPolicy egress rules](https://kubernetes.io/docs/concepts/services-networking/network-policies/#egress)
- [Policy types: additive union](https://kubernetes.io/docs/concepts/services-networking/network-policies/#behavior-of-to-and-from-selectors)
