# Default-Deny Ingress

## How NetworkPolicy changes the default

The previous exercise showed that all traffic is allowed until a NetworkPolicy exists. The
moment you create a NetworkPolicy that selects a Pod, **Kubernetes switches to a deny-by-default
model for the traffic types listed in `policyTypes`**.

An ingress policy that has no `ingress` rules (or an empty list) effectively says:
_"I manage ingress for these Pods, and I allow nothing."_

```
NetworkPolicy (podSelector: {}, policyTypes: [Ingress], no ingress rules)
       │
       └─► blocks ALL inbound traffic to EVERY Pod in the namespace
```

## The anatomy of a default-deny policy

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny
  namespace: fl-k8s-0152
spec:
  podSelector: {} # {} = select ALL Pods in the namespace
  policyTypes:
    - Ingress # manage ingress traffic for selected Pods
      # no spec.ingress key = deny all ingress sources
```

Key points:

- **`podSelector: {}`** — an empty selector matches every Pod in the namespace. If you want to
  target a specific workload instead, use `matchLabels`.
- **`policyTypes: [Ingress]`** — explicitly declares that this policy governs ingress. The
  Kubernetes API server defaults `policyTypes` to `[Ingress]` when no egress rules are present,
  but stating it explicitly makes the intent clear and guards against future edits that add
  egress rules.
- **No `spec.ingress` key** — absence means "allow nothing". An explicit empty list
  (`ingress: []`) has the same effect.

## The task

An `api` server Pod, a `grader-client` Pod (wget available), and a `deny-client` Pod (curl
available) are already running in namespace `fl-k8s-0152`. There is no NetworkPolicy yet.

Create a NetworkPolicy named `default-deny` that blocks all inbound traffic to every Pod.

**1. Write the manifest** (`deny.yaml`):

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny
  namespace: fl-k8s-0152
spec:
  podSelector: {}
  policyTypes:
    - Ingress
```

**2. Apply it:**

```bash
kubectl apply -f deny.yaml
```

**3. Verify the block:**

```bash
kubectl exec deny-client -n fl-k8s-0152 -- \
  curl -s --max-time 5 http://api/
```

The command should hang for 5 seconds and then exit with a timeout error — the connection is
silently dropped by the CNI.

**4. Confirm the policy:**

```bash
kubectl describe networkpolicy default-deny -n fl-k8s-0152
```

Look for `PodSelector: <none>` (meaning all Pods) and `Allowing ingress traffic: <none>`.

## Why the server Pod must be up

The grader's `traffic-blocked` check first confirms the `api` Pod is Running and Ready. This
prevents a false positive: a crashed server looks identical to a NetworkPolicy block from the
outside. If the server is not ready, the check waits rather than passing.

## Reference

- [NetworkPolicy default deny](https://kubernetes.io/docs/concepts/services-networking/network-policies/#default-deny-all-ingress-traffic)
