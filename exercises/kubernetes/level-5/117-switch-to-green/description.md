# Switch to Green

## The traffic switch

In a blue/green deployment, switching traffic is a single selector change on the Service.
Both Deployments are already running — the change is instant and requires no Pod restarts.

The Service currently routes to blue:

```yaml
selector:
  app: web
  version: blue
```

After you change `version: blue` to `version: green`, new connections go to green Pods
immediately. In-flight connections may briefly fail as they drain from blue Pods, but the
swap is typically sub-second at cluster level.

## Verify before switching

Confirm green Pods are ready before switching traffic:

```bash
kubectl get pods -n fl-k8s-0117 -l version=green
kubectl rollout status deployment/web-green -n fl-k8s-0117
```

## The task

Switch Service `web` in namespace `fl-k8s-0117` from blue to green by editing the
selector. The grader checks:

1. Service selector is `{app: web, version: green}`
2. Service routes to the `web-green` Deployment
3. Service has at least 2 ready endpoints
4. HTTP through the Service returns an nginx response

## Reference

- [Services — selectors](https://kubernetes.io/docs/concepts/services-networking/service/#services-in-kubernetes)
