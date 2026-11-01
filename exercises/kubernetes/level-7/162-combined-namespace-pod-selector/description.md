# Combined Namespace + Pod Selector (AND logic)

## The problem

Namespace `fl-k8s-0162` runs an API server with a default-deny ingress policy.
Namespace `fl-k8s-0162-client` has two clients:

| Pod                   | Labels           | Should reach api? |
| --------------------- | ---------------- | ----------------- |
| `authorized-client`   | `role: frontend` | Yes               |
| `unauthorized-client` | `role: backend`  | No                |

You need to allow `authorized-client` specifically — not just any pod in the client
namespace, and not just any pod with `role: frontend` from any namespace.

## AND logic vs OR logic

NetworkPolicy `from` entries can combine `namespaceSelector` and `podSelector`. The
placement determines whether they are ANDed or ORed.

**AND logic** — both selectors in one `from` entry (one `-`):

```yaml
ingress:
  - from:
      - namespaceSelector: # ← same dash
          matchLabels:
            kubernetes.io/metadata.name: fl-k8s-0162-client
        podSelector: # ← no dash; belongs to same entry
          matchLabels:
            role: frontend
```

This allows pods that are **simultaneously** in `fl-k8s-0162-client` AND have
`role: frontend`. `unauthorized-client` (in the same namespace but with `role: backend`)
is blocked.

**OR logic** — two separate `from` entries (two `-`):

```yaml
ingress:
  - from:
      - namespaceSelector: # ← first entry
          matchLabels:
            kubernetes.io/metadata.name: fl-k8s-0162-client
      - podSelector: # ← second entry (OR!)
          matchLabels:
            role: frontend
```

This allows pods in `fl-k8s-0162-client` **OR** pods with `role: frontend` from **any**
namespace — a much wider rule. The difference is just a single `-` character.

## Setup

```bash
kubectl get pods -n fl-k8s-0162
kubectl get pods -n fl-k8s-0162-client --show-labels
kubectl get networkpolicy -n fl-k8s-0162
```

## Your task

Create a NetworkPolicy named `allow-prod-frontend` in `fl-k8s-0162` that:

- Selects all pods (`podSelector: {}`)
- Uses AND logic: ingress from pods in `fl-k8s-0162-client` AND with `role: frontend`
- Uses `policyTypes: [Ingress]`

## Verify manually

```bash
# authorized-client (role: frontend) — should succeed:
kubectl exec authorized-client -n fl-k8s-0162-client -- \
  wget -qO- -T5 http://api.fl-k8s-0162.svc.cluster.local/

# unauthorized-client (role: backend) — should timeout:
kubectl exec unauthorized-client -n fl-k8s-0162-client -- \
  wget -qO- -T5 http://api.fl-k8s-0162.svc.cluster.local/

# deny-client (fl-k8s-0162, no role label) — should timeout:
kubectl exec deny-client -n fl-k8s-0162 -- \
  curl -s --max-time 5 http://api.fl-k8s-0162.svc.cluster.local/
```
