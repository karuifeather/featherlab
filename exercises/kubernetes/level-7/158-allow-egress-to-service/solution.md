# Solution

Create a NetworkPolicy that allows `deny-client` Pods to reach `api` Pods on
port 80:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-api-egress
  namespace: fl-k8s-0158
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
              app: api
      ports:
        - protocol: TCP
          port: 80
```

Apply it:

```bash
kubectl apply -f allow-api-egress.yaml
```

Verify that the server is reachable from the unrestricted `grader-client`:

```bash
kubectl exec grader-client -n fl-k8s-0158 -- \
  wget -qO- -T5 http://api.fl-k8s-0158:80/
```

Confirm `deny-client` can now also reach `api`:

```bash
kubectl exec deny-client -n fl-k8s-0158 -- \
  curl -s --max-time 8 http://api.fl-k8s-0158/
```

Expected: nginx welcome page for both.

List all policies in the namespace:

```bash
kubectl get networkpolicies -n fl-k8s-0158
```

**Key points:**

- Three policies now govern `deny-client`: `deny-egress-client` (deny all),
  `allow-dns` (DNS to 10.96.0.10), and `allow-api-egress` (TCP 80 to `app=api`).
- Multiple NetworkPolicies for the same Pod are **additive**: the union of all
  matching egress rules is enforced.
- `egress[].to[].podSelector` selects server Pods in the **same namespace** as
  the policy. To target Pods in another namespace, combine with a
  `namespaceSelector`.
