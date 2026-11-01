# Service Ports

## Port vs targetPort

A Kubernetes Service has two port fields that are often confused:

| Field        | Meaning                                              |
| ------------ | ---------------------------------------------------- |
| `port`       | What clients connect to (the Service's virtual port) |
| `targetPort` | What the container actually listens on               |

These do **not** have to match. A Service can expose port `8080` externally while routing traffic to containers listening on port `80`. This is useful when you want a consistent external port regardless of what port the application uses internally.

## Diagnosing the problem

In namespace `fl-k8s-0100` there is a Service named `api` that is misconfigured:

```bash
kubectl get svc api -n fl-k8s-0100 -o yaml
```

Look at the `ports` section — both `port` and `targetPort` are currently set to `80`, but the Service is supposed to expose port `8080`.

## The task

Fix the Service so that:

- Clients connect on port `8080`
- Traffic is forwarded to container port `80`

## Reference

- [Services — defining a service](https://kubernetes.io/docs/concepts/services-networking/service/#defining-a-service)
