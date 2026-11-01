# Solution

Create a NetworkPolicy that allows `deny-client` Pods to reach `secondary` Pods
on port 80:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-secondary-egress
  namespace: fl-k8s-0160
spec:
  podSelector:
    matchLabels:
      app: deny-client
  policyTypes:
    - Egress
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: secondary
      ports:
        - protocol: TCP
          port: 80
```

Apply it:

```bash
kubectl apply -f allow-secondary-egress.yaml
```

Verify that `grader-client` (unrestricted) reaches both servers:

```bash
kubectl exec grader-client -n fl-k8s-0160 -- \
  wget -qO- -T5 http://api.fl-k8s-0160:80/

kubectl exec grader-client -n fl-k8s-0160 -- \
  wget -qO- -T5 http://secondary.fl-k8s-0160:80/
```

Confirm `deny-client` now reaches `secondary`:

```bash
kubectl exec deny-client -n fl-k8s-0160 -- \
  curl -s --max-time 8 http://secondary.fl-k8s-0160/
```

List all policies:

```bash
kubectl get networkpolicies -n fl-k8s-0160
```

**Key points:**

- NetworkPolicies are **additive**: adding `allow-secondary-egress` extends
  `deny-client`'s allowed destinations without removing `api`.
- The complete egress picture for `deny-client` after all four policies: DNS to
  10.96.0.10, TCP 80 to `app=api`, TCP 80 to `app=secondary`, nothing else.
- Each allow policy is independent. You could remove `allow-api-egress` and
  `deny-client` would lose access to `api` but keep access to `secondary`.
- `grader-client` has no NetworkPolicy of its own and can always reach any
  destination — it is used here only to confirm both servers are responding.
