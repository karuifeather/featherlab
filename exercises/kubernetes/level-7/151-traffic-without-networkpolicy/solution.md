# Solution

This is an observation exercise — no NetworkPolicy needs to be created. The grader-client
can already reach the api Service because no policy exists to restrict traffic.

**Verify connectivity:**

```bash
kubectl exec grader-client -n fl-k8s-0151 -- wget -qO- http://api:80/
```

Expected output: the nginx welcome page HTML, including `Welcome to nginx!`.

**Confirm no NetworkPolicy exists:**

```bash
kubectl get networkpolicies -n fl-k8s-0151
```

Expected output: `No resources found in fl-k8s-0151 namespace.`

**Key points:**

- Without any NetworkPolicy, Kubernetes allows all Pod-to-Pod and Pod-to-Service traffic.
- The `api` Service name resolves via cluster DNS (`api.fl-k8s-0151.svc.cluster.local`)
  to the Service's ClusterIP, so the short name `api` works from within the same namespace.
- The grader runs `wget -qO- http://api:80/` inside the `grader-client` Pod to verify
  the check. It passes when the response contains `Welcome to nginx`.
