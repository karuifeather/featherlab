# Gateway Status Diagnostics

## Reading status conditions

Every Gateway API resource reports its health through **status conditions**. Knowing how
to read them is the first step in diagnosing routing failures.

### Gateway conditions

| Condition    | Meaning                                                                                                         |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| `Accepted`   | The controller recognized the Gateway and accepted its configuration. The listener port and protocol are valid. |
| `Programmed` | The data plane is configured and ready to accept connections.                                                   |

A Gateway can be `Accepted: True` but `Programmed: False` if, for example, the listener
port is in conflict or the controller is still reconciling.

### HTTPRoute conditions

Each entry in `status.parents` describes the relationship between the HTTPRoute and one
parent Gateway:

| Condition      | Meaning                                                                  |
| -------------- | ------------------------------------------------------------------------ |
| `Accepted`     | The parent Gateway accepted this route (hostname intersection is valid). |
| `ResolvedRefs` | All backend Service references in the HTTPRoute rules could be resolved. |

`ResolvedRefs: False` with reason `BackendNotFound` means a Service named in `backendRefs`
does not exist in the namespace. **The route is accepted by the Gateway**, but traffic
cannot be forwarded because the destination Service is missing.

## Current state

In namespace `fl-k8s-0135`:

- Gateway `app-gw` is Accepted and Programmed (listening on port 80).
- HTTPRoute `app-route` attaches to `app-gw` correctly (`Accepted: True`), but references
  a Service named `missing-service` in its backendRefs. That Service does not exist, so
  `ResolvedRefs: False`.
- Service `app:80` (nginx:1.27) is running and ready.

## The task

1. Read the HTTPRoute status to identify the broken backend reference:

```bash
kubectl get httproute app-route -n fl-k8s-0135 -o yaml
```

Look at `status.parents[0].conditions`. Find the condition where `status: "False"` and
read the `reason` field.

2. List Services to confirm what exists:

```bash
kubectl get service -n fl-k8s-0135
```

3. Fix the HTTPRoute — change the backendRef Service name from `missing-service` to `app`:

```bash
kubectl edit httproute app-route -n fl-k8s-0135
```

## Verify

```bash
kubectl describe httproute app-route -n fl-k8s-0135
```

Both `Accepted` and `ResolvedRefs` conditions should show `status: True`.

Test the route:

```bash
kubectl exec -n fl-k8s-0135 grader-client -- \
  curl -s -H "Host: app.k8s-0135.fl.test" \
  http://traefik.traefik-system.svc.cluster.local/
```

## Reference

- [HTTPRoute status](https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.RouteParentStatus)
- [Gateway status](https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.GatewayStatus)
