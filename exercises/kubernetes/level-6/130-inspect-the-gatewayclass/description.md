# Inspect the GatewayClass

## The Gateway API resource hierarchy

The Gateway API uses a three-tier model to separate concerns between platform administrators
and application developers:

- **GatewayClass** — cluster-scoped, platform-owned. Names the controller implementation
  (e.g. Traefik, Envoy, nginx). Administrators install it; developers read it.
- **Gateway** — namespace-scoped, developer-owned. Declares a specific load-balancer
  instance that listens on one or more ports. A Gateway always references a GatewayClass.
- **HTTPRoute** — namespace-scoped, developer-owned. Attaches to a Gateway and maps
  hostnames + path rules to backend Services.

The GatewayClass acts like a `StorageClass` for networking: it answers the question
"which controller should own Gateways of this type?"

## The controllerName field

Every GatewayClass has a `spec.controllerName` — a domain-qualified string that identifies
the implementation. When you create a Gateway, the controller whose name matches the
GatewayClass `controllerName` picks it up and programs the data plane.

This platform uses **Traefik v3** as the routing controller.

## The task

The namespace `fl-k8s-0130` has been created for you.

1. Inspect the `traefik` GatewayClass:

```bash
kubectl get gatewayclass traefik -o yaml
```

2. Locate the `spec.controllerName` field and copy the exact value.

3. Create a ConfigMap named `my-notes` in namespace `fl-k8s-0130` with that value
   stored under the key `controllerName`:

```bash
kubectl create configmap my-notes \
  --from-literal=controllerName=<paste-the-value-here> \
  -n fl-k8s-0130
```

## Verify

```bash
kubectl get configmap my-notes -n fl-k8s-0130 -o yaml
```

The `data` section should show the `controllerName` key with the exact string from
the GatewayClass spec.

## Reference

- [GatewayClass concept](https://gateway-api.sigs.k8s.io/concepts/api-overview/#gatewayclass)
- [Gateway API overview](https://gateway-api.sigs.k8s.io/concepts/api-overview/)
