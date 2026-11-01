# Debug DNS

## The problem

A client application in namespace `fl-k8s-0123` is trying to reach a `search` Service that lives
in a different namespace, `fl-k8s-0123-svc`. The client is using the short name `search` and
getting a DNS lookup failure.

## Why the short name fails

When a Pod makes a DNS lookup, CoreDNS appends the search domains from `/etc/resolv.conf`:

```
search fl-k8s-0123.svc.cluster.local svc.cluster.local cluster.local
```

The short name `search` gets expanded to:

- `search.fl-k8s-0123.svc.cluster.local` — **does not exist** (the Service is in a different namespace)
- `search.svc.cluster.local` — does not exist
- `search.cluster.local` — does not exist

None match, so the lookup fails.

## The fix: use the cross-namespace DNS name

The correct name for a Service in another namespace is:

```
<service-name>.<namespace>
```

Which CoreDNS expands to the fully qualified name:

```
search.fl-k8s-0123-svc.svc.cluster.local
```

## Diagnostic commands

From the client Pod:

```bash
# Inspect search paths
kubectl exec grader-client -n fl-k8s-0123 -- cat /etc/resolv.conf

# Try the short name (expect failure)
kubectl exec grader-client -n fl-k8s-0123 -- nslookup search

# Try the cross-namespace FQDN (expect success)
kubectl exec grader-client -n fl-k8s-0123 -- nslookup search.fl-k8s-0123-svc.svc.cluster.local
```

## The task

Namespace `fl-k8s-0123-svc` has a running `search` Service. The grader client Pod is in
`fl-k8s-0123`. There is no code to change — this exercise asks you to understand and verify the
correct cross-namespace DNS name by running the nslookup commands above.

The grader will:

1. Confirm `search` Deployment is ready in `fl-k8s-0123-svc`
2. Run `nslookup search.fl-k8s-0123-svc.svc.cluster.local` from `grader-client` in `fl-k8s-0123` and verify it succeeds
3. Send an HTTP request to `search.fl-k8s-0123-svc:80` from the same client Pod

## Reference

- [DNS for Services and Pods](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/)
