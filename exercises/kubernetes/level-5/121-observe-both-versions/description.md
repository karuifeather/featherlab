# Observe Both Versions

## How to verify a canary is healthy

After setting up a canary deployment you need to confirm it actually works before sending more
traffic its way. The key things to check:

1. **Both Deployments are rolled out** — no Pods stuck in Pending or CrashLoopBackOff.
2. **The Service has endpoints for both** — EndpointSlices include ready Pods from both Deployments.
3. **The Service routes real HTTP traffic** — send a request and verify the application responds.

## Checking endpoints

```bash
kubectl get endpointslices -l kubernetes.io/service-name=myapp -n fl-k8s-0121
```

You will see two EndpointSlice objects — one per Deployment controller. The `ENDPOINTS` column
shows the ready Pod IPs.

## Sending a test request

```bash
kubectl exec grader-client -n fl-k8s-0121 -- wget -qO- http://myapp.fl-k8s-0121:80/
```

Because there are 4 Pods total (3 stable + 1 canary), each request has approximately a 25% chance
of landing on the canary Pod. A single request proving the Service works is enough — the grader
does not assert which version responded.

## Real-world canary observation

In production you would check:

- Canary Pod logs (`kubectl logs -l version=canary -n fl-k8s-0121`) for errors
- Error rate and latency metrics from Prometheus or a service mesh
- Send many requests and count version=canary responses to confirm the traffic split

The grader verifies infrastructure readiness (both Deployments up, Service has endpoints, HTTP works),
not exact traffic percentages.

## The task

Namespace `fl-k8s-0121` already has both Deployments and the Service. Verify the canary setup is
correct by inspecting the Deployments, EndpointSlices, and sending an HTTP request through the
Service.

The grader will confirm all four checks automatically once the infrastructure is healthy.

## Reference

- [EndpointSlices](https://kubernetes.io/docs/concepts/services-networking/endpoint-slices/)
- [kubectl exec](https://kubernetes.io/docs/tasks/debug/debug-application/get-shell-running-container/)
