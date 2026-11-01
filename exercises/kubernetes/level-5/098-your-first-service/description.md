# Your First Service

## The problem with Pod IPs

When a Deployment creates Pods, each one gets an IP address from the cluster's network.
But that IP is ephemeral — it changes whenever the Pod restarts, and there can be multiple
Pods sharing the same workload. How does another application reliably reach the workload?

**A Service** is a stable, named endpoint that load-balances traffic across all matching Pods.
Instead of tracking individual Pod IPs, other workloads connect to the Service name, and
Kubernetes handles routing. The Service IP (`ClusterIP`) stays constant for the life of the
Service even as Pods come and go.

## How Services find their Pods

A Service selects backing Pods using a **selector** — a set of key/value labels. Any Pod
that carries matching labels receives traffic. The Deployment and the Service must agree:
the Deployment's Pod template labels determine which Pods run, and the Service's selector
determines which Pods receive traffic.

## The task

A `web` Deployment is already running in namespace `fl-k8s-0098`. Expose it with a
**ClusterIP** Service named `web` so that port `80` on the Service maps to port `80` on the
Deployment's Pods.

The simplest way is:

```bash
kubectl expose deployment web --port=80 --target-port=80 -n fl-k8s-0098
```

This creates a ClusterIP Service and copies the Deployment's Pod template labels as
the Service selector automatically.

After creating the Service, inspect it:

```bash
kubectl get svc web -n fl-k8s-0098
kubectl describe svc web -n fl-k8s-0098
```

The `Endpoints` field in `describe` lists the IP:port pairs of the currently ready Pods —
proof that the selector is working.

## Reference

- [Services overview](https://kubernetes.io/docs/concepts/services-networking/service/)
- [`kubectl expose`](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_expose/)
