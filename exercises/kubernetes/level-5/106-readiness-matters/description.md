# Readiness Matters

## Readiness probes and EndpointSlices

Kubernetes uses **readiness probes** to decide whether a Pod can receive traffic. Only Pods that pass their readiness probe are added to EndpointSlices as ready addresses.

If a readiness probe fails, the Pod is still `Running` — it just is not included as a ready endpoint. Traffic will not be sent to it.

You can see this clearly:

```bash
# Pods are Running but not ready:
kubectl get pods -n fl-k8s-0106
# NAME          READY   STATUS    RESTARTS
# payments-xxx  0/1     Running   0   ← 0/1 means not ready

# Service has no ready endpoints:
kubectl get endpoints payments -n fl-k8s-0106
# NAME       ENDPOINTS   AGE
# payments   <none>      ...
```

## The problem

In namespace `fl-k8s-0106`, the `payments` Deployment has a readiness probe that checks HTTP path `/ready`. nginx does not serve that path (it returns 404), so all Pods fail readiness and the Service has no backends.

## The task

Fix the readiness probe so it checks a path that nginx actually serves. The nginx default page is at `/`.

After the fix, wait for the rollout to complete:

```bash
kubectl rollout status deployment/payments -n fl-k8s-0106 --timeout=120s
```

Then verify endpoints appear:

```bash
kubectl get endpoints payments -n fl-k8s-0106
```

## Reference

- [Configure Liveness, Readiness and Startup Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
