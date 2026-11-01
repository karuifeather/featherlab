# DNS Search Paths

## What /etc/resolv.conf controls

Kubernetes injects a custom `/etc/resolv.conf` into every Pod. Inspect it:

```bash
kubectl exec grader-client -n fl-k8s-0111 -- cat /etc/resolv.conf
```

You will see output similar to:

```
nameserver 10.96.0.10
search fl-k8s-0111.svc.cluster.local svc.cluster.local cluster.local
options ndots:5
```

The `search` line lists suffixes the resolver tries in order when a hostname contains fewer
dots than `ndots` (5 by default). For a bare name like `metrics`:

1. Try `metrics.fl-k8s-0111.svc.cluster.local` — **found**

That is why `metrics` (short form) resolves inside the same namespace.

## Why short names fail across namespaces

A Pod in `fl-k8s-0110` has a different `search` line:

```
search fl-k8s-0110.svc.cluster.local svc.cluster.local cluster.local
```

Querying bare `metrics` tries `metrics.fl-k8s-0110.svc.cluster.local` — which does not exist.
The fix is to use the namespace-qualified name: `metrics.fl-k8s-0111`.

## The task

Namespace `fl-k8s-0111` has a running `metrics` Deployment but no Service yet.

1. Create a ClusterIP Service named `metrics` that exposes port `80` and routes to the
   `metrics` Deployment.
2. Inspect `/etc/resolv.conf` in `grader-client` to observe the search paths.
3. Confirm DNS resolution using the fully qualified name:
   `nslookup metrics.fl-k8s-0111.svc.cluster.local` — this always works regardless of DNS client.

The grader checks that the Service has a ready endpoint and that the name
`metrics.fl-k8s-0111` resolves from inside the cluster.

## Reference

- [DNS for Services and Pods](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/)
- [Customizing DNS service](https://kubernetes.io/docs/tasks/administer-cluster/dns-custom-nameservers/)
