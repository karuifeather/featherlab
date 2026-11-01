# ExternalName Service

## What ExternalName does

An ExternalName Service maps a cluster-internal DNS name to an **external hostname** via a
CNAME record. It is the simplest way to give in-cluster code a stable, short name for a
service that lives outside the cluster.

```
nslookup external-api.fl-k8s-0113  →  CNAME → api.example.com
```

Application code uses `external-api` (or `external-api.fl-k8s-0113`) and the CNAME redirects
the connection to `api.example.com` — no code change needed if the external endpoint changes,
you only update the Service.

## What ExternalName is NOT

- It does **not** proxy TCP traffic.
- It does **not** terminate TLS.
- It does **not** create endpoints or a ClusterIP.
- The CNAME target (`api.example.com`) must be DNS-resolvable from the node at connection time.

For actual traffic to flow, the client must resolve `api.example.com` itself (the CNAME is
transparent at the HTTP level); do not rely on this for TLS hostname verification.

## Creating an ExternalName Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: external-api
  namespace: fl-k8s-0113
spec:
  type: ExternalName
  externalName: api.example.com
```

There is no `selector`, no `ports`, and no `clusterIP` field. `kubectl expose` does not
support `ExternalName` — always use a manifest.

## The task

Create an ExternalName Service named `external-api` in namespace `fl-k8s-0113` that
maps to `api.example.com`.

The grader verifies the Service type and `externalName` field. No connectivity check is
performed because `api.example.com` is a synthetic target that does not resolve in-cluster.

## Reference

- [ExternalName Services](https://kubernetes.io/docs/concepts/services-networking/service/#externalname)
- [DNS for Services and Pods](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/#services)
