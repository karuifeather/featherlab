# Services and DNS Mastery

This capstone exercise combines everything from Level 5: Services, selectors, canary deployments,
EndpointSlices, and cross-namespace routing. There are two independent faults to find and fix.

## The environment

**Namespace `fl-k8s-0124`** (web tier):

- Deployment `web` — 2 replicas, `nginx:1.27`, labels `app=web, version=blue`
- Deployment `web-canary` — 0 replicas, `nginx:1.27`, labels `app=web, version=canary`
- Service `web` — selector `app=web`
- Pod `grader-client` — your test client

**Namespace `fl-k8s-0124-data`** (data tier):

- Deployment `db` — 1 replica, `nginx:1.27`, label `app=db`
- Service `db` — something is wrong; diagnose it

## Your objectives

You must complete these independently (either order):

1. **Fix the `db` Service** in `fl-k8s-0124-data` so it routes to the `db` Deployment.
   Diagnose the fault with `kubectl describe` before changing anything.

2. **Start the `web-canary`** Deployment by scaling it to 1 replica.
   The `web` Service should then have 3 ready endpoints (2 blue + 1 canary).

The grader verifies both fixes independently and then confirms HTTP routing through the `web` Service.

## Diagnostic approach

Start by describing the broken Service and comparing its selector to the Deployment's Pod labels:

```bash
kubectl describe svc db -n fl-k8s-0124-data
kubectl get deployment db -n fl-k8s-0124-data -o yaml
```

For the canary:

```bash
kubectl get deployments -n fl-k8s-0124
kubectl get endpointslices -l kubernetes.io/service-name=web -n fl-k8s-0124
```

## Reference

- [Debugging Services](https://kubernetes.io/docs/tasks/debug/debug-application/debug-service/)
- [EndpointSlices](https://kubernetes.io/docs/concepts/services-networking/endpoint-slices/)
