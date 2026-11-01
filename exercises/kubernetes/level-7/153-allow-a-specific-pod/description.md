# Allow Traffic from a Specific Pod

## Selective allow rules

A default-deny policy (from the previous exercise) blocks everything. To restore access for
**specific** Pods, you add a second NetworkPolicy that names them by label.

NetworkPolicies are additive: each policy adds allowed sources. The union of all policies
that select a Pod determines what traffic is permitted. So you can keep the default-deny
policy in place and add a separate allow policy on top.

```
default-deny (podSelector: {})   →  blocks all ingress to all Pods
allow-frontend (from role=frontend) →  adds: ingress from role=frontend is allowed
──────────────────────────────────────────────────────
Effective rule: only Pods with role=frontend may reach the api Pod
```

## The `from` selector

An ingress rule's `from` field is a list of sources. A `podSelector` inside `from` matches
Pods in the **same namespace** by label:

```yaml
spec:
  podSelector:
    matchLabels:
      app: api # which Pods this rule applies TO
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              role: frontend # which Pods are allowed IN
```

The `spec.podSelector` at the top (`app: api`) targets the server Pod. The `from[].podSelector`
inside the rule (`role: frontend`) names the allowed clients.

## The task

A `default-deny` NetworkPolicy is already installed in namespace `fl-k8s-0153`. Two client Pods
are running:

| Pod             | Labels                                 | Expected result            |
| --------------- | -------------------------------------- | -------------------------- |
| `grader-client` | `role=frontend`                        | allowed (should reach api) |
| `deny-client`   | `app=deny-client` (no `role=frontend`) | blocked                    |

Create a NetworkPolicy named `allow-frontend` that allows ingress to the `api` Pod from Pods
with label `role=frontend`.

**1. Write the manifest** (`allow.yaml`):

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend
  namespace: fl-k8s-0153
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
              role: frontend
```

**2. Apply it:**

```bash
kubectl apply -f allow.yaml
```

**3. Verify the grader-client is now allowed:**

```bash
kubectl exec grader-client -n fl-k8s-0153 -- wget -qO- http://api/
```

Expected: nginx welcome page HTML is returned.

**4. Verify the deny-client is still blocked:**

```bash
kubectl exec deny-client -n fl-k8s-0153 -- curl -s --max-time 5 http://api/
```

Expected: the command times out (the default-deny policy still covers `deny-client`).

**5. Inspect both policies:**

```bash
kubectl get networkpolicies -n fl-k8s-0153
kubectl describe networkpolicy allow-frontend -n fl-k8s-0153
```

## Reference

- [Ingress from a Pod in the same namespace](https://kubernetes.io/docs/concepts/services-networking/network-policies/#allow-traffic-from-within-the-same-namespace)
