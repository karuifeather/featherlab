# Resolve a Service

## How Kubernetes DNS works

Every Service gets a DNS entry maintained by CoreDNS. The fully qualified domain name (FQDN)
follows this format:

```
<service-name>.<namespace>.svc.cluster.local
```

For the `api` Service in namespace `fl-k8s-0109`, the FQDN is:

```
api.fl-k8s-0109.svc.cluster.local
```

## DNS search paths

Pods do not always need the full FQDN. Kubernetes configures `/etc/resolv.conf` inside each
Pod with search domains, for example:

```
search fl-k8s-0109.svc.cluster.local svc.cluster.local cluster.local
```

This means a Pod in `fl-k8s-0109` can reach the `api` Service with just `api` — the resolver
appends the search domains automatically until it finds a match.

Check the search paths in any Pod:

```bash
kubectl exec grader-client -n fl-k8s-0109 -- cat /etc/resolv.conf
```

## Looking up a Service with nslookup

```bash
kubectl exec grader-client -n fl-k8s-0109 -- nslookup api
kubectl exec grader-client -n fl-k8s-0109 -- nslookup api.fl-k8s-0109
kubectl exec grader-client -n fl-k8s-0109 -- nslookup api.fl-k8s-0109.svc.cluster.local
```

All three forms resolve to the same ClusterIP. The short form only works from within the
same namespace.

## The task

Namespace `fl-k8s-0109` has a running `api` Deployment but no Service yet.

1. Create a ClusterIP Service named `api` that exposes port `80` and routes to the `api`
   Deployment.
2. Verify it resolves with `nslookup` from inside the namespace.

The grader runs a DNS probe through `grader-client` to confirm the Service name resolves.

## Reference

- [DNS for Services and Pods](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/)
- [Service discovery](https://kubernetes.io/docs/concepts/services-networking/service/#discovering-services)
