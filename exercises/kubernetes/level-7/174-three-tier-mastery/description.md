# Three-Tier Application NetworkPolicy

## Three-tier security model

A typical web application has three tiers:

```
external clients
      │
      ▼ HTTP (port 80)
  [ frontend ]
      │
      ▼ HTTP (port 80)
   [ api ]
      │
      ▼ HTTP (port 80)
   [ db ]
```

With NetworkPolicy, you can enforce that:

- External clients can reach **frontend** only.
- Only **frontend** can reach **api**.
- Only **api** can reach **db**.

No pod can jump tiers. A compromised frontend cannot directly reach the database.

## Implementing the model with three NetworkPolicies

Each tier gets its own `Ingress`-type NetworkPolicy that controls who can send it traffic.
Because each policy includes `policyTypes: [Ingress]`, Kubernetes implicitly denies all
ingress not listed in that policy's rules.

**Tier 1 — frontend (open to all internal clients):**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: frontend-open
  namespace: fl-k8s-0174
spec:
  podSelector:
    matchLabels:
      app: frontend
  policyTypes:
    - Ingress
  ingress:
    - ports:
        - protocol: TCP
          port: 80
```

An ingress rule with no `from:` selector allows traffic from **any** source within the
cluster on that port. This is the intended "open" tier.

**Tier 2 — api (only from frontend):**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-from-frontend
  namespace: fl-k8s-0174
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: frontend
      ports:
        - protocol: TCP
          port: 80
```

Only pods with label `app=frontend` can reach `app=api`. Any external client (including
`deny-client`) is blocked.

**Tier 3 — db (only from api):**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: db-from-api
  namespace: fl-k8s-0174
spec:
  podSelector:
    matchLabels:
      app: db
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: api
      ports:
        - protocol: TCP
          port: 80
```

## The starting state

In namespace `fl-k8s-0174`:

- Pod `frontend` (nginx:1.27, `app=frontend`) + Service `frontend` on port 80.
- Pod `api` (nginx:1.27, `app=api`) + Service `api` on port 80.
- Pod `db` (nginx:1.27, `app=db`) + Service `db` on port 80.
- Pod `grader-client` (busybox:1.36, `app=grader-client, role=external`).
- Pod `deny-client` (curlimages/curl:8.10.1, `app=deny-client, role=external`).
- **No NetworkPolicies** — all traffic is currently allowed.

## The task

Create all three NetworkPolicies (`frontend-open`, `api-from-frontend`, `db-from-api`).

After applying them:

- `grader-client` can reach `frontend` (any pod can reach the open tier).
- `deny-client` cannot reach `api` directly (only `frontend` may talk to `api`).
- `frontend` can reach `api`; `api` can reach `db`. No other cross-tier access.

**Apply all three:**

```bash
kubectl apply -f frontend-open.yaml
kubectl apply -f api-from-frontend.yaml
kubectl apply -f db-from-api.yaml
```

**Verify policies are present:**

```bash
kubectl get networkpolicy -n fl-k8s-0174
```

**Test the allowed path (optional):**

```bash
kubectl exec grader-client -n fl-k8s-0174 -- \
  wget -qO- -T5 http://frontend.fl-k8s-0174.svc.cluster.local:80/
```

**Test the blocked path (optional):**

```bash
kubectl exec deny-client -n fl-k8s-0174 -- \
  curl -s --max-time 5 http://api.fl-k8s-0174.svc.cluster.local:80/
echo "exit: $?"   # expected: 28
```

## Reference

- [NetworkPolicy — example policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/#the-networkpolicy-resource)
- [Kubernetes security best practices](https://kubernetes.io/docs/concepts/security/)
