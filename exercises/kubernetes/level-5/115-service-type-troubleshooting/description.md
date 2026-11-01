# Service Type Troubleshooting

## The port mismatch

A Service has three port values that must be consistent:

| Field           | What it means                                        |
| --------------- | ---------------------------------------------------- |
| `port`          | The port clients connect to on the Service ClusterIP |
| `targetPort`    | The container port the Service forwards traffic to   |
| `containerPort` | The port the application actually listens on         |

When `targetPort` does not match `containerPort`, the Service appears healthy (it has the right selector) but requests silently fail — TCP connections to the Service succeed, but the container refuses them because nothing is listening on that port.

## How to diagnose

```bash
kubectl describe svc api -n fl-k8s-0115
```

Look at:

- **Port** — the Service port (8080 here)
- **TargetPort** — where traffic is forwarded (currently wrong)
- **Endpoints** — Pod IP:port pairs; if `targetPort` is unreachable, endpoints may still list but requests fail

Check what port the container actually listens on:

```bash
kubectl get deployment api -n fl-k8s-0115 -o jsonpath='{.spec.template.spec.containers[0].ports}'
```

nginx listens on port 80.

## The task

Namespace `fl-k8s-0115` has:

- Deployment `api` running `nginx:1.27` (2 replicas, containerPort 80)
- Service `api` of type NodePort with port 8080 → targetPort **9090** (wrong)

Fix the Service so `targetPort` is `80`. HTTP requests through the Service must return
a valid nginx response.

## Reference

- [Services — defining a Service](https://kubernetes.io/docs/concepts/services-networking/service/#defining-a-service)
