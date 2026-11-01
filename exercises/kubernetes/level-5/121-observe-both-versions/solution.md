# Solution

Both Deployments and the Service are already set up correctly in `fl-k8s-0121`. This exercise asks
you to verify the canary configuration rather than create it.

Check both Deployments:

```bash
kubectl get deployments -n fl-k8s-0121
```

Confirm 3 stable + 1 canary replicas are ready (`READY` column shows desired/available).

Check EndpointSlices:

```bash
kubectl get endpointslices -l kubernetes.io/service-name=myapp -n fl-k8s-0121
```

Both slices should show ready endpoints.

Send a test request:

```bash
kubectl exec grader-client -n fl-k8s-0121 -- wget -qO- http://myapp.fl-k8s-0121:80/
```

The nginx welcome page HTML confirms the Service is routing traffic. Once all checks pass the grader
marks the exercise complete.
