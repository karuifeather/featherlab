# Least-Privilege Microservice

## The principle

A microservice should only accept traffic from its legitimate callers and only connect
to the services it actually needs. Everything else — inbound or outbound — is denied.

This exercise applies that principle to the `api` pod:

| Direction | Allowed                                         | Blocked                         |
| --------- | ----------------------------------------------- | ------------------------------- |
| Ingress   | `grader-client` (app: grader-client) on port 80 | `deny-client` and everyone else |
| Egress    | `db` pod (app: db) on port 5432                 | All other outbound traffic      |

## Setup

```bash
kubectl get pods -n fl-k8s-0167 --show-labels
# api, db, grader-client, deny-client
```

The `db` pod runs nginx configured to listen on port 5432. In Kubernetes NetworkPolicy,
egress port numbers match the **destination pod's port**, not the Service port.

## Building the policy

A single NetworkPolicy can contain both ingress and egress rules:

```yaml
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: grader-client
      ports:
        - protocol: TCP
          port: 80
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: db
      ports:
        - protocol: TCP
          port: 5432
```

`policyTypes: [Ingress, Egress]` activates both restrictions. The explicit rules open
the minimal needed paths; everything else is denied.

## DNS note

This policy also blocks `api`'s DNS egress (no rule for UDP/TCP port 53). The `api`
pod serves static content and does not need DNS, so this is acceptable here. In
production, add:

```yaml
egress:
  - to:
      - namespaceSelector:
          matchLabels:
            kubernetes.io/metadata.name: kube-system
        podSelector:
          matchLabels:
            k8s-app: kube-dns
    ports:
      - protocol: UDP
        port: 53
      - protocol: TCP
        port: 53
```

## Your task

Create a NetworkPolicy named `api-least-privilege` in `fl-k8s-0167` with the spec
described above.

## Verify manually

```bash
# grader-client → api: should succeed
kubectl exec grader-client -n fl-k8s-0167 -- \
  wget -qO- -T5 http://api.fl-k8s-0167.svc.cluster.local/

# deny-client → api: should be blocked (exit 28)
kubectl exec deny-client -n fl-k8s-0167 -- \
  curl -s --max-time 5 http://api.fl-k8s-0167.svc.cluster.local/
```
