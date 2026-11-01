# Egress Policy Union

## Multiple NetworkPolicies are additive

When a Pod is selected by more than one NetworkPolicy, Kubernetes **unions** all
their rules together. There is no precedence or "first match wins" — every allowed
rule from every matching policy applies simultaneously.

For egress, this means:

- If policy A allows TCP to `app=api` on port 80
- And policy B allows TCP to `app=secondary` on port 80

Then a Pod matched by both A and B can reach **both** `api` and `secondary`.

A `deny-all` policy with no egress rules does not cancel the allow rules — it
simply contributes zero allowed destinations. The union of "deny all (no rules)"
and "allow `app=api`" is "allow `app=api`".

## Where things stand

In namespace `fl-k8s-0160`, the `deny-client` Pod has three existing policies:

| Policy                   | Effect on deny-client                           |
| ------------------------ | ----------------------------------------------- |
| `deny-all-egress-client` | Blocks all egress (contributes no rules)        |
| `allow-dns`              | Allows UDP/TCP port 53 to 10.96.0.10 (kube-dns) |
| `allow-api-egress`       | Allows TCP port 80 to pods with `app=api`       |

At baseline, `deny-client` can reach `api` but NOT `secondary`.

## The task

Add a NetworkPolicy named **`allow-secondary-egress`** that permits egress from
`app=deny-client` Pods to `app=secondary` Pods on TCP port 80.

**1. Write the manifest** (`allow-secondary-egress.yaml`):

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-secondary-egress
  namespace: fl-k8s-0160
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
              app: secondary
      ports:
        - protocol: TCP
          port: 80
```

**2. Apply it:**

```bash
kubectl apply -f allow-secondary-egress.yaml
```

**3. Verify grader-client (unrestricted) reaches both servers:**

```bash
kubectl exec grader-client -n fl-k8s-0160 -- \
  wget -qO- -T5 http://api.fl-k8s-0160:80/

kubectl exec grader-client -n fl-k8s-0160 -- \
  wget -qO- -T5 http://secondary.fl-k8s-0160:80/
```

**4. Confirm deny-client can also reach secondary (new policy takes effect):**

```bash
kubectl exec deny-client -n fl-k8s-0160 -- \
  curl -s --max-time 8 http://secondary.fl-k8s-0160/
```

Expected: nginx welcome page from both `api` and `secondary`.

**5. View the complete policy set:**

```bash
kubectl get networkpolicies -n fl-k8s-0160
```

You should see four policies: `deny-all-egress-client`, `allow-dns`,
`allow-api-egress`, and your new `allow-secondary-egress`.

## The union in action

After all four policies apply to `deny-client`:

| Destination           | Port       | Allowed?                       |
| --------------------- | ---------- | ------------------------------ |
| 10.96.0.10 (kube-dns) | UDP/TCP 53 | Yes (`allow-dns`)              |
| `app=api`             | TCP 80     | Yes (`allow-api-egress`)       |
| `app=secondary`       | TCP 80     | Yes (`allow-secondary-egress`) |
| Anything else         | Any        | No (deny-all wins by absence)  |

## Reference

- [NetworkPolicy: behavior of selectors](https://kubernetes.io/docs/concepts/services-networking/network-policies/#behavior-of-to-and-from-selectors)
- [Default deny all egress traffic](https://kubernetes.io/docs/concepts/services-networking/network-policies/#default-deny-all-egress-traffic)
