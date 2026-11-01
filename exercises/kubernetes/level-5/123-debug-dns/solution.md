# Solution

No resources need to be created — the setup already has `search` running in `fl-k8s-0123-svc` and
`grader-client` in `fl-k8s-0123`.

Confirm the Service is up:

```bash
kubectl get svc search -n fl-k8s-0123-svc
kubectl rollout status deployment/search -n fl-k8s-0123-svc
```

Verify cross-namespace DNS from the client:

```bash
kubectl exec grader-client -n fl-k8s-0123 -- nslookup search.fl-k8s-0123-svc
```

Expected output includes a non-error `Address` line pointing to the Service ClusterIP.

Send an HTTP request to confirm routing:

```bash
kubectl exec grader-client -n fl-k8s-0123 -- wget -qO- http://search.fl-k8s-0123-svc:80/
```

The nginx welcome page confirms DNS and routing both work.
