# Promote or Roll Back

## The decision

When a canary deployment is in production you eventually face one of two outcomes:

**Promote:** The canary looks healthy — metrics are good, error rates are low. Scale the canary
up to full capacity, scale the stable version down to zero, and eventually delete the stable
Deployment. The canary becomes the new stable.

**Roll back:** The canary is misbehaving — errors, crashes, or a bad image. Delete the canary
Deployment immediately so all traffic returns to the stable version.

## This scenario: roll back

Namespace `fl-k8s-0122` has:

- `api-stable` — 3 replicas, `nginx:1.27`, healthy
- `api-canary` — 1 replica, `nginx:1.27.99`, **failing** (image does not exist → ImagePullBackOff)
- Service `api` with selector `app: api`

The canary Pod is stuck in `ImagePullBackOff`. It has no ready endpoints, so the Service is
currently routing all traffic to the 3 stable Pods — but the failing canary is noise, wastes
resources, and could confuse monitoring.

## Before you act

Always confirm stable is healthy first:

```bash
kubectl rollout status deployment/api-stable -n fl-k8s-0122
kubectl get endpointslices -l kubernetes.io/service-name=api -n fl-k8s-0122
```

Stable should show 3 ready endpoints. The canary's EndpointSlice should be empty (no ready Pods).

## The task

Roll back by removing the failing canary Deployment. Stable must remain healthy throughout.

## Reference

- [Canary deployments](https://kubernetes.io/docs/concepts/workloads/management/#canary-deployments)
- [kubectl delete](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_delete/)
