# Reach Another Namespace

## Cross-namespace DNS

DNS search paths in Kubernetes only include the current namespace. If a Pod in `fl-k8s-0110`
queries just `catalog`, the resolver looks for:

```
catalog.fl-k8s-0110.svc.cluster.local
```

There is no Service named `catalog` in `fl-k8s-0110`, so the lookup fails. To reach a Service
in a **different** namespace you must include the namespace in the name:

```
catalog.fl-k8s-0110-app
```

The resolver appends `.svc.cluster.local` automatically, so this shorter form works.

## Verifying cross-namespace connectivity

With a client Pod running in `fl-k8s-0110`:

```bash
# DNS check — should return the ClusterIP
kubectl exec grader-client -n fl-k8s-0110 -- nslookup catalog.fl-k8s-0110-app

# HTTP check — should return nginx HTML
kubectl exec grader-client -n fl-k8s-0110 -- wget -qO- http://catalog.fl-k8s-0110-app:80/
```

If the DNS lookup fails, there is no Service in `fl-k8s-0110-app` named `catalog`.
If DNS works but HTTP fails, check that the Service has endpoints (i.e., the selector
matches running Pods).

## The task

Namespace `fl-k8s-0110-app` has a running `catalog` Deployment but no Service. Namespace
`fl-k8s-0110` has a `grader-client` Pod that acts as the test client.

1. Create a ClusterIP Service named `catalog` in `fl-k8s-0110-app` that exposes port `80`
   and routes to the `catalog` Deployment.
2. Confirm it is reachable from `fl-k8s-0110` using the name `catalog.fl-k8s-0110-app`.

The grader sends both a DNS probe and an HTTP request from `grader-client` in `fl-k8s-0110`
to `catalog.fl-k8s-0110-app:80`.

## Reference

- [DNS for Services and Pods](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/)
- [Namespaces walkthrough](https://kubernetes.io/docs/tasks/administer-cluster/namespaces-walkthrough/)
