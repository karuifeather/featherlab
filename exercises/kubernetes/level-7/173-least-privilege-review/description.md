# Least-Privilege Review

## The principle of least privilege for network access

Least-privilege network access means: **only the specific traffic you explicitly need
should be allowed**. Everything else is denied.

In Kubernetes NetworkPolicy, this is achieved by:

1. Creating a policy with `policyTypes: [Ingress]` that selects your workload.
2. Adding only the `ingress:` rules that represent legitimate traffic sources.
3. Any traffic not covered by an ingress rule is **implicitly denied**.

There is no explicit "deny" keyword in Kubernetes NetworkPolicy. The deny is the
default: once a `policyTypes: [Ingress]` policy selects a Pod, all unlisted ingress
is blocked.

## Verifying both paths

A useful practice when reviewing a policy is to verify **both** the allowed and denied
paths:

- **Positive test**: traffic from an authorized source passes (curl exit 0, HTTP 200).
- **Negative test**: traffic from an unauthorized source is blocked (curl exit 28, timeout).

This catches two types of mistakes:

- A policy that is too permissive (would pass the positive test but fail the negative).
- A policy that is too restrictive or broken (would fail the positive test).

## The starting state

In namespace `fl-k8s-0173`:

- Pod `api` (nginx:1.27, `app=api`) + Service `api` on port 80.
- Pod `grader-client` (busybox:1.36, labels `app=grader-client` and **`role=monitor`**).
- Pod `deny-client` (curlimages/curl:8.10.1, labels `app=deny-client` and **`role=worker`**).
- **No pre-existing NetworkPolicies** — all traffic is currently allowed.

Without a policy, both `grader-client` and `deny-client` can reach `api`.

## The task

Create NetworkPolicy `api-access-control` in namespace `fl-k8s-0173` that:

1. Selects `app=api` pods.
2. Sets `policyTypes: [Ingress]` (creates implicit default-deny for all other ingress).
3. Allows ingress **only from `role=monitor`** pods on TCP port 80.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-access-control
  namespace: fl-k8s-0173
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
              role: monitor
      ports:
        - protocol: TCP
          port: 80
```

**Apply:**

```bash
kubectl apply -f api-access-control.yaml
```

**Verify the policy:**

```bash
kubectl describe networkpolicy api-access-control -n fl-k8s-0173
```

**Test the allowed path:**

```bash
kubectl exec grader-client -n fl-k8s-0173 -- \
  wget -qO- -T5 http://api.fl-k8s-0173.svc.cluster.local:80/
```

Expected: nginx HTML response (grader-client has `role=monitor`).

**Test the denied path:**

```bash
kubectl exec deny-client -n fl-k8s-0173 -- \
  curl -s --max-time 5 http://api.fl-k8s-0173.svc.cluster.local:80/
echo "exit: $?"
```

Expected: exit code 28 (deny-client has `role=worker`, not `role=monitor`).

## Reference

- [NetworkPolicy — default-deny](https://kubernetes.io/docs/concepts/services-networking/network-policies/#default-deny-all-ingress-traffic)
- [Principle of least privilege](https://kubernetes.io/docs/concepts/security/pod-security-standards/)
