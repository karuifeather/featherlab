# Configure a Canary

## What is a canary deployment?

A **canary** is a second, smaller Deployment running a new version of your application alongside the
stable version. By routing a small fraction of real traffic to the canary, you can observe its
behaviour in production before committing to a full rollout.

## How Kubernetes Services implement canary

A Kubernetes Service selects Pods by label. The trick is that two Deployments can share the _same_
selector label:

- **checkout-stable** — labels: `app: checkout, version: stable` — 4 replicas
- **checkout-canary** — labels: `app: checkout, version: canary` — 1 replica

The Service selector is **only** `app: checkout`. It matches both, so kube-proxy distributes new
connections across all 5 Pods — roughly 80% to stable, 20% to canary.

## Traffic is probabilistic, not guaranteed

Each new TCP connection is sent to a randomly chosen endpoint. With 4 stable and 1 canary Pod,
individual requests have approximately a 20% chance of hitting the canary, but you cannot guarantee
which Pod handles any specific request. This is inherent to kube-proxy's load balancing; for exact
weight control you need a service mesh (e.g. Istio).

## The task

Namespace `fl-k8s-0120` already has `checkout-stable` (4 replicas) and a `checkout` Service with
selector `app: checkout`.

1. Create a Deployment named `checkout-canary` with:
   - 1 replica
   - Image `nginx:1.27`
   - Pod labels: `app: checkout` **and** `version: canary`
2. Verify the Service now shows 5 ready endpoints:
   ```bash
   kubectl get endpointslices -l kubernetes.io/service-name=checkout -n fl-k8s-0120
   ```

Do **not** add a `version` label to the Service selector — that would break the canary by excluding
one of the Deployments.

## Reference

- [Canary deployments (Kubernetes docs)](https://kubernetes.io/docs/concepts/workloads/management/#canary-deployments)
- [Services — selectors](https://kubernetes.io/docs/concepts/services-networking/service/#defining-a-service)
