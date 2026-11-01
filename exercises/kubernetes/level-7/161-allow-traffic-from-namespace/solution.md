# Solution

Create the `allow-from-staging` NetworkPolicy using the auto-applied
`kubernetes.io/metadata.name` label:

```bash
kubectl apply -n fl-k8s-0161 -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-from-staging
  namespace: fl-k8s-0161
spec:
  podSelector: {}
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: fl-k8s-0161-client
EOF
```

Verify the policy was created:

```bash
kubectl get networkpolicy -n fl-k8s-0161
# NAME                POD-SELECTOR   AGE
# allow-from-staging  <none>         5s
# deny-all            <none>         ...
```

Test cross-namespace access (should succeed):

```bash
kubectl exec cross-ns-client -n fl-k8s-0161-client -- \
  wget -qO- -T5 http://api.fl-k8s-0161.svc.cluster.local/
# <!DOCTYPE html> ... Welcome to nginx! ...
```

Test same-namespace is still blocked (should timeout — curl exit 28):

```bash
kubectl exec deny-client -n fl-k8s-0161 -- \
  curl -s -o /dev/null -w "%{http_code}" --max-time 5 \
  http://api.fl-k8s-0161.svc.cluster.local/
# (command times out, exit 28)
```

## Why `kubernetes.io/metadata.name`?

The `namespaceSelector` field matches namespace **labels**, not namespace names. Every
namespace in Kubernetes 1.21+ automatically receives the immutable label
`kubernetes.io/metadata.name=<name>`. Using it lets you select a namespace by its
name without requiring custom labels.

A common mistake is to write `namespace: fl-k8s-0161-client` directly in the policy —
that field does not exist in NetworkPolicy spec. The selector must always use labels.
