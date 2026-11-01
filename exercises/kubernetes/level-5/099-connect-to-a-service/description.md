# Connect to a Service

## Why test connectivity?

A Service existing in Kubernetes does not prove it works. The selector might not match
any running Pods, the Port or targetPort might be wrong, or the Pods might not be ready.
The only reliable test is to send a real HTTP request through the Service and confirm the
application responds.

Inside a cluster, the easiest way to test Service connectivity is a **temporary client Pod**:

```bash
kubectl run client --restart=Never --image=busybox:1.36 -n fl-k8s-0099 \
  --rm -it -- wget -qO- http://backend:80/
```

This creates a one-shot Pod in the same namespace, runs `wget` against the Service name,
prints the response, and deletes the Pod when it exits.

## How in-cluster DNS works

Within the same namespace, the Service name `backend` resolves via DNS search paths:
Kubernetes automatically appends `.fl-k8s-0099.svc.cluster.local` (or equivalent). You
can also use the fully qualified name if you prefer to be explicit:

```bash
kubectl run client --restart=Never --image=busybox:1.36 -n fl-k8s-0099 \
  --rm -it -- wget -qO- http://backend.fl-k8s-0099:80/
```

## The task

Namespace `fl-k8s-0099` has a `backend` Deployment but no Service yet.

1. Create a ClusterIP Service named `backend` that exposes port `80` and routes to the
   `backend` Deployment.
2. Verify the Service has endpoints (not `<none>`) using `kubectl describe svc backend`.
3. Confirm connectivity by running a temporary `busybox:1.36` client Pod with `wget`.

The grader runs its own HTTP probe through the Service to confirm the application responds.

## Reference

- [Services — discovering services](https://kubernetes.io/docs/concepts/services-networking/service/#discovering-services)
- [DNS for Services and Pods](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/)
