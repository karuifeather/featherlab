# Isolate a Namespace

## The scenario

Namespace `fl-k8s-0163` is suspected to be compromised. You need to quarantine it
immediately by blocking **all** ingress and egress for every pod in the namespace.
Pods outside it should not be affected.

```bash
kubectl get pods -n fl-k8s-0163
kubectl get pods -n fl-k8s-0163-safe
```

## Default-deny with both Ingress and Egress

A NetworkPolicy blocks only the traffic types listed in `policyTypes`. When a type is
listed with no corresponding rules, it defaults to deny-all for that type.

```yaml
spec:
  podSelector: {} # applies to ALL pods in the namespace
  policyTypes:
    - Ingress # listed but no ingress rules → deny all ingress
    - Egress # listed but no egress rules → deny all egress
```

This creates a complete wall around every pod in `fl-k8s-0163`:

- No external traffic can reach them (ingress blocked)
- They cannot initiate any outbound connections, including DNS (egress blocked)

## What does and doesn't change

- Pods in `fl-k8s-0163-safe` are **not** affected (NetworkPolicy is namespace-scoped)
- The `api` pod's readiness probe to `localhost:80` still works (localhost is exempt)
- Communication between pods in `fl-k8s-0163` is also blocked

## Your task

Create a NetworkPolicy named `isolate-namespace` in `fl-k8s-0163` that:

- Selects all pods (`podSelector: {}`)
- Declares `policyTypes: [Ingress, Egress]`
- Has **no** ingress rules and **no** egress rules

```bash
kubectl apply -n fl-k8s-0163 -f - <<'EOF'
# your policy here
EOF
```

## Verify manually

After applying the policy, both outbound connections from `deny-client` should fail:

```bash
# Egress blocked — DNS also fails (curl exit 6):
kubectl exec deny-client -n fl-k8s-0163 -- \
  curl -s --max-time 5 http://api.fl-k8s-0163.svc.cluster.local/

# Cross-namespace: safe-client in fl-k8s-0163-safe can no longer reach api:
kubectl exec safe-client -n fl-k8s-0163-safe -- \
  wget -qO- -T5 http://api.fl-k8s-0163.svc.cluster.local/
```

## Reference

- [NetworkPolicy policyTypes](https://kubernetes.io/docs/concepts/services-networking/network-policies/#the-networkpolicy-resource)
