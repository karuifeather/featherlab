# Solution

Create a ReferenceGrant in each backend namespace.

## ReferenceGrant for fl-k8s-0146-v1

```bash
kubectl apply -f - <<'EOF'
apiVersion: gateway.networking.k8s.io/v1beta1
kind: ReferenceGrant
metadata:
  name: allow-from-gw-ns
  namespace: fl-k8s-0146-v1
spec:
  from:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      namespace: fl-k8s-0146
  to:
    - group: ""
      kind: Service
EOF
```

## ReferenceGrant for fl-k8s-0146-v2

```bash
kubectl apply -f - <<'EOF'
apiVersion: gateway.networking.k8s.io/v1beta1
kind: ReferenceGrant
metadata:
  name: allow-from-gw-ns
  namespace: fl-k8s-0146-v2
spec:
  from:
    - group: gateway.networking.k8s.io
      kind: HTTPRoute
      namespace: fl-k8s-0146
  to:
    - group: ""
      kind: Service
EOF
```

## Verify

```bash
# Both grants now exist
kubectl get referencegrant -n fl-k8s-0146-v1
kubectl get referencegrant -n fl-k8s-0146-v2

# HTTPRoute should be fully resolved
kubectl get httproute api-route -n fl-k8s-0146

# Send six requests — expect a mix of version-1 and version-2
for i in $(seq 1 6); do
  kubectl exec -n fl-k8s-0146 grader-client -- \
    curl -s -H "Host: api.k8s-0146.fl.test" \
    http://traefik.traefik-system.svc.cluster.local/
done
```

## Why two grants are required

A ReferenceGrant is scoped to the namespace it lives in — `metadata.namespace` defines
the target. The `from` field says _which_ namespace is allowed to reference into _this_
namespace. You cannot write a single ReferenceGrant that covers two target namespaces;
each namespace must opt in independently.
