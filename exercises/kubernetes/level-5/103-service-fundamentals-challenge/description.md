# Service Fundamentals Challenge

## Overview

This challenge tests your ability to expose multiple Deployments with different port mappings and verify each Service has healthy endpoints.

In namespace `fl-k8s-0103` there are two Deployments but no Services:

- **`auth`** — 2 replicas, should be exposed on port 80 (straight-through)
- **`gateway`** — 1 replica, should be exposed on port 8080 (external) routing to port 80 (container)

## The task

1. Create a ClusterIP Service `auth` that exposes port `80` and routes to container port `80`
2. Create a ClusterIP Service `gateway` that exposes port `8080` and routes to container port `80`
3. Verify both Services have ready endpoints

## Verification

```bash
kubectl get svc -n fl-k8s-0103
kubectl get endpoints -n fl-k8s-0103
```

The `auth` Endpoints should list two Pod IPs and the `gateway` Endpoints should list one Pod IP.

## Reference

- [Services — defining a service](https://kubernetes.io/docs/concepts/services-networking/service/#defining-a-service)
