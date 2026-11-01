# Named Ports

## What are named ports?

Container ports can have names:

```yaml
containers:
  - name: nginx
    ports:
      - name: http
        containerPort: 80
      - name: metrics
        containerPort: 9090
```

A Service can then reference the port by name in `targetPort`:

```yaml
ports:
  - port: 80
    targetPort: http # references the container port named "http"
```

This is more resilient than using numbers: if the application changes its listening port, you update the Deployment's `containerPort` and the Service automatically follows — no need to change the Service manifest.

## The task

Namespace `fl-k8s-0101` has a `catalog` Deployment whose container exposes a port named `http` (container port 80). There is no Service yet.

Create a ClusterIP Service named `catalog` that:

- Exposes port `80`
- Routes to targetPort `http` (the named port, not the number)
- Selects Pods with label `app=catalog`

## Reference

- [Services — defining a service](https://kubernetes.io/docs/concepts/services-networking/service/#defining-a-service)
