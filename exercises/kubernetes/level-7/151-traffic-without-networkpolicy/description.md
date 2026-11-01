# Traffic Without NetworkPolicy

## The default: allow everything

In Kubernetes, **all Pod-to-Pod traffic is allowed by default**. Any Pod in the cluster can
reach any other Pod or Service, regardless of namespace, unless a NetworkPolicy explicitly
restricts that traffic. This is the open-by-default model.

NetworkPolicy objects change this behaviour — but only when:

1. A CNI plugin that enforces NetworkPolicy is installed (this cluster runs **kindnet**, which
   enforces policies natively since kind v0.24).
2. A NetworkPolicy actually exists in the namespace.

Until you create a NetworkPolicy, no rules apply and all traffic flows freely.

## What NetworkPolicy is (and is not)

A `NetworkPolicy` is a namespaced Kubernetes resource that declares _which traffic is allowed_
into (`ingress`) or out of (`egress`) the Pods it selects. It is **not** a firewall rule — it
is a declaration that the CNI plugin translates into actual network enforcement (iptables, eBPF,
or similar).

```
Pod A ──► (no policy) ──► Pod B   # traffic allowed
Pod A ──► NetworkPolicy  ──► Pod B   # depends on the policy rules
```

## The task

An `api` server Pod (nginx:1.27) and a `grader-client` Pod are already running in
namespace `fl-k8s-0151`. There are no NetworkPolicy objects in this namespace.

Your task is to **observe** that traffic flows freely:

**1. Check what is running:**

```bash
kubectl get pods,services -n fl-k8s-0151
```

**2. Verify connectivity from the grader-client:**

```bash
kubectl exec grader-client -n fl-k8s-0151 -- wget -qO- http://api:80/
```

You should see the nginx welcome page HTML returned immediately.

**3. Try a one-shot Pod to confirm from a fresh client:**

```bash
kubectl run test --rm -it --image=busybox:1.36 -n fl-k8s-0151 \
  -- wget -qO- http://api:80/
```

This shows that **any** Pod — including one you just created — can reach the `api` Service
without needing any allow rule.

**4. Confirm no NetworkPolicy exists:**

```bash
kubectl get networkpolicies -n fl-k8s-0151
```

Expected output: `No resources found in fl-k8s-0151 namespace.`

## Key takeaway

The open-by-default model means you must be _intentional_ about locking traffic down. In the
next exercises you will create NetworkPolicy objects and observe how they change this behaviour.

## Reference

- [NetworkPolicy overview](https://kubernetes.io/docs/concepts/services-networking/network-policies/)
- [Network plugin requirements](https://kubernetes.io/docs/concepts/extend-kubernetes/compute-storage-net/network-plugins/#network-plugin-requirements)
