# Two Versions, One Service

## Blue/green deployments

A blue/green deployment runs two versions of an application simultaneously. Only one
version receives live traffic at a time. Switching traffic is instant: you change the
Service selector, not the Deployments.

The trick is two labels on every Pod:

- `app=web` — shared by both versions (the common label)
- `version=blue` or `version=green` — the version discriminator

The Service selector uses **both** labels:

```yaml
selector:
  app: web
  version: blue # ← only Pods with this label get traffic
```

Pods with `app=web, version=green` do not match because the selector requires `version=blue`.

## Inspect the current state

```bash
kubectl get deployments -n fl-k8s-0116 -L version
kubectl get svc web -n fl-k8s-0116 -o jsonpath='{.spec.selector}'
kubectl get endpoints web -n fl-k8s-0116
```

The Endpoints listing shows only the IP addresses of blue Pods.

## The task

Namespace `fl-k8s-0116` has:

- `web-blue` Deployment (2 replicas) — currently receiving traffic
- `web-green` Deployment (2 replicas) — idle, no traffic
- Service `web` with `selector: {app: web, version: blue}`

Scale `web-green` to 3 replicas to prepare for the upcoming traffic switch. Do **not**
change the Service selector — that comes in the next exercise.

## Reference

- [Deployments — blue/green](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#blue-green-deployment)
