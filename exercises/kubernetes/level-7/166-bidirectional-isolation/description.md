# Bidirectional Isolation — Ingress AND Egress

## The scenario

Namespace `fl-k8s-0166` has an API server and two clients:

- `client` (app: client) — needs to be **fully isolated**: cannot send or receive traffic
- `grader-client` — must **not** be affected by the isolation policy

The isolation must apply only to the `client` pod, not to all pods in the namespace.

```bash
kubectl get pods -n fl-k8s-0166 --show-labels
```

## Targeting a specific pod

When `podSelector` is not empty, the policy applies only to matching pods:

```yaml
spec:
  podSelector:
    matchLabels:
      app: client # only the "client" pod is affected
  policyTypes:
    - Ingress
    - Egress
```

`grader-client` has `app: grader-client` and does not match — it is untouched.

## What "no rules" means

When a type is listed in `policyTypes` but no corresponding `ingress` or `egress`
block is provided, that type defaults to **deny all**:

```yaml
policyTypes:
  - Ingress # no ingress rules = block all incoming traffic
  - Egress # no egress rules = block all outgoing traffic, including DNS
```

The `client` pod cannot reach anything. It cannot make DNS queries, cannot connect to
`api`, and nothing can connect to it.

## Your task

Create a NetworkPolicy named `isolate-client` in `fl-k8s-0166` that:

- Targets pods with `app: client`
- Declares `policyTypes: [Ingress, Egress]`
- Has no ingress or egress rules

## Verify manually

After applying the policy:

```bash
# client is isolated — egress blocked, DNS fails (exit 6):
kubectl exec client -n fl-k8s-0166 -- \
  curl -s --max-time 5 http://api.fl-k8s-0166.svc.cluster.local/
# curl: (6) Could not resolve host

# grader-client is NOT isolated — can still reach api:
kubectl exec grader-client -n fl-k8s-0166 -- \
  wget -qO- -T5 http://api.fl-k8s-0166.svc.cluster.local/
# Welcome to nginx!
```
