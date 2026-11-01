# Allow Traffic from a Namespace

## The problem

Namespace `fl-k8s-0161` runs an API server. A separate namespace `fl-k8s-0161-client`
needs to call it, but a default-deny policy blocks all ingress. Pods in `fl-k8s-0161`
itself must remain blocked — only the cross-namespace client gets in.

```
fl-k8s-0161-client
  cross-ns-client  ──── should be ALLOWED ────────▶  api  (fl-k8s-0161)
fl-k8s-0161
  deny-client      ──── must stay BLOCKED ──────────▶  api
```

Inspect what's already in the namespace:

```bash
kubectl get networkpolicy -n fl-k8s-0161
kubectl get pods -n fl-k8s-0161
kubectl get pods -n fl-k8s-0161-client
```

## How namespaceSelector works

`namespaceSelector` in a NetworkPolicy `from` entry matches **namespace labels**, not
namespace names. Every namespace gets the automatic label
`kubernetes.io/metadata.name=<name>` since Kubernetes 1.21.

```bash
kubectl get namespace fl-k8s-0161-client --show-labels
# kubernetes.io/metadata.name=fl-k8s-0161-client (plus featherlab management labels)
```

Use that label to target a specific namespace:

```yaml
ingress:
  - from:
      - namespaceSelector:
          matchLabels:
            kubernetes.io/metadata.name: fl-k8s-0161-client
```

## Cross-namespace DNS

`cross-ns-client` lives in `fl-k8s-0161-client`. Within-namespace short names (`api`)
only work from inside the same namespace. From a different namespace, use the full
service FQDN:

```
api.fl-k8s-0161.svc.cluster.local
```

## Your task

Create a NetworkPolicy named `allow-from-staging` in namespace `fl-k8s-0161` that:

- Selects **all pods** in the namespace (`podSelector: {}`)
- Allows ingress from namespace `fl-k8s-0161-client` using `kubernetes.io/metadata.name`
- Uses `policyTypes: [Ingress]`

## Verify manually

```bash
# Should succeed (exit 0):
kubectl exec cross-ns-client -n fl-k8s-0161-client -- \
  wget -qO- -T5 http://api.fl-k8s-0161.svc.cluster.local/

# Should timeout (exit 28):
kubectl exec deny-client -n fl-k8s-0161 -- \
  curl -s --max-time 5 http://api.fl-k8s-0161.svc.cluster.local/
```

## Reference

- [NetworkPolicy namespaceSelector](https://kubernetes.io/docs/concepts/services-networking/network-policies/#behavior-of-to-and-from-selectors)
