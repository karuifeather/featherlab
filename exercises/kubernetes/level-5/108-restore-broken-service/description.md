# Restore a Broken Service

## Compound failures

Real-world broken Services often have more than one issue. In this exercise you must find and fix two separate problems:

1. **Wrong targetPort** — the Service routes to a port the container does not listen on
2. **Resulting empty endpoints** — once targetPort is wrong, HTTP connections time out even if endpoints appear in EndpointSlices

## The setup

Namespace `fl-k8s-0108` has an `inventory` Deployment (nginx:1.27, 2 replicas) and a Service that is supposed to expose port `9090` (external) routing to container port `80`.

**Current state:**

- Service exposes port `9090` ✓
- Service `targetPort` is `9090` ✗ (nginx listens on `80`, not `9090`)
- Selector is correct ✓

## Diagnosing targetPort mismatch

When targetPort is wrong, kube-proxy creates iptables rules that forward to the wrong port. The connection reaches the Pod but the container refuses it.

You can observe this with:

```bash
kubectl get svc inventory -n fl-k8s-0108 -o yaml
# Look at: spec.ports[0].targetPort
```

## The task

Fix the Service `targetPort` from `9090` to `80`, then verify:

1. Endpoints appear (2 ready)
2. HTTP request through port 9090 returns an nginx response

## Reference

- [Services — defining a service](https://kubernetes.io/docs/concepts/services-networking/service/#defining-a-service)
