# Fix Isolation by Correcting a Label

## NetworkPolicy selects by labels, not by name

A NetworkPolicy's `podSelector` and its `ingress[].from[].podSelector` both match
Pods by their **labels** — not their names. When a Pod is missing the label a
policy expects, the policy does not apply to it, even if its name or purpose
matches.

This is powerful: you can move a Pod in or out of a NetworkPolicy's scope without
touching the policy itself — just by adding, removing, or changing labels.

## The situation

In namespace `fl-k8s-0159` there are two NetworkPolicies:

| Policy           | Effect                                                              |
| ---------------- | ------------------------------------------------------------------- |
| `deny-all`       | Blocks ALL ingress to every Pod in the namespace                    |
| `allow-frontend` | Allows ingress to `app=api` Pods from Pods carrying `role=frontend` |

The `isolated-client` Pod should be allowed to reach `api`, but it is currently
missing the `role=frontend` label. The `deny-client` Pod also lacks this label
and must remain blocked.

Your task is to fix `isolated-client` by labeling it — **without editing any
NetworkPolicy**.

## Inspecting the existing policies

```bash
kubectl describe networkpolicy deny-all -n fl-k8s-0159
kubectl describe networkpolicy allow-frontend -n fl-k8s-0159
```

The `allow-frontend` policy's `From` section shows:

```
PodSelector: role=frontend
```

So a client Pod needs `role=frontend` to be permitted.

## Adding a label to a running Pod

```bash
kubectl label pod isolated-client role=frontend -n fl-k8s-0159
```

Verify the label was applied:

```bash
kubectl get pod isolated-client -n fl-k8s-0159 --show-labels
```

Expected output includes `role=frontend` in the labels column.

## Verifying the result

**isolated-client should now reach api:**

```bash
kubectl exec isolated-client -n fl-k8s-0159 -- \
  wget -qO- -T5 http://api.fl-k8s-0159:80/
```

Expected: nginx welcome page.

**deny-client should still be blocked:**

```bash
kubectl exec deny-client -n fl-k8s-0159 -- \
  curl -s --max-time 8 http://api.fl-k8s-0159/
```

Expected: exit 28 (TCP timeout — no `role=frontend` label).

## Why this works without touching the policy

The CNI continuously evaluates each Pod's current labels against every NetworkPolicy
selector. The moment you add `role=frontend` to `isolated-client`, kindnet updates
the firewall rules for that Pod. No restart, no reapply of the policy needed.

## Reference

- [kubectl label](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_label/)
- [NetworkPolicy podSelector](https://kubernetes.io/docs/concepts/services-networking/network-policies/#behavior-of-to-and-from-selectors)
