# Namespace Selector with kubernetes.io/metadata.name

## The setup

Three namespaces share a common API server:

| Namespace              | Role             | Should reach api? |
| ---------------------- | ---------------- | ----------------- |
| `fl-k8s-0165`          | server           | —                 |
| `fl-k8s-0165-frontend` | frontend clients | Yes               |
| `fl-k8s-0165-backend`  | backend clients  | No                |

A default-deny policy in `fl-k8s-0165` blocks all ingress. You need to allow only
`fl-k8s-0165-frontend`.

```bash
kubectl get pods -n fl-k8s-0165
kubectl get pods -n fl-k8s-0165-frontend
kubectl get pods -n fl-k8s-0165-backend
kubectl get networkpolicy -n fl-k8s-0165
```

## The automatic metadata.name label

Every Kubernetes namespace gets an immutable label automatically:

```
kubernetes.io/metadata.name=<namespace-name>
```

Verify it:

```bash
kubectl get namespace fl-k8s-0165-frontend --show-labels
# NAME                       STATUS   LABELS
# fl-k8s-0165-frontend       Active   kubernetes.io/metadata.name=fl-k8s-0165-frontend,...
```

Use this label to select exactly one namespace without adding custom labels:

```yaml
namespaceSelector:
  matchLabels:
    kubernetes.io/metadata.name: fl-k8s-0165-frontend
```

## Pitfalls to avoid

| Mistake                                                          | Effect                                                            |
| ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| `namespaceSelector: {}`                                          | Allows traffic from ALL namespaces — too broad                    |
| `namespaceSelector` matching both frontend and backend labels    | Lets backend in                                                   |
| `podSelector: {matchLabels: {kubernetes.io/metadata.name: ...}}` | Wrong field — metadata.name is a namespace label, not a pod label |

## Your task

Create a NetworkPolicy named `allow-from-frontend` in `fl-k8s-0165` that:

- Selects all pods (`podSelector: {}`)
- Allows ingress from `fl-k8s-0165-frontend` using `kubernetes.io/metadata.name`
- Does NOT allow `fl-k8s-0165-backend`

## Verify manually

```bash
# frontend-client — should succeed:
kubectl exec frontend-client -n fl-k8s-0165-frontend -- \
  wget -qO- -T5 http://api.fl-k8s-0165.svc.cluster.local/

# backend-client — should time out:
kubectl exec backend-client -n fl-k8s-0165-backend -- \
  wget -qO- -T5 http://api.fl-k8s-0165.svc.cluster.local/
```
