# Route by Hostname

## Virtual hosting with Ingress

A single Ingress can route traffic to multiple Services by inspecting the HTTP `Host` header.
Each entry in `spec.rules` corresponds to one virtual hostname. When a request arrives at
Traefik, the router matches the `Host` header against the rules and forwards to the backend
Service for that hostname.

```
Host: frontend.k8s-0126.fl.test  →  Service frontend:80
Host: api.k8s-0126.fl.test        →  Service api:80
```

This lets you share a single Traefik entry point across many independent backends without
exposing separate NodePorts or LoadBalancer IPs.

## The starting state

Two backends are already running in namespace `fl-k8s-0126`:

- Deployment `frontend` + Service `frontend:80` — serves a page containing `frontend`
- Deployment `api` + Service `api:80` — serves a page containing `api-backend`
- Ingress `web` — already routes `frontend.k8s-0126.fl.test` → `frontend:80`
- Pod `grader-client` — used to send test requests

The `api` backend exists but the Ingress has no rule for `api.k8s-0126.fl.test`. Requests to
that hostname currently reach Traefik but match no rule and return a 404.

## The task

Add a rule for `api.k8s-0126.fl.test` → `api:80` to the existing Ingress `web`.

**1. Export the current Ingress:**

```bash
kubectl get ingress web -n fl-k8s-0126 -o yaml > ingress.yaml
```

**2. Add the api rule** under `spec.rules`:

```yaml
spec:
  ingressClassName: traefik
  rules:
    - host: frontend.k8s-0126.fl.test
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: frontend
                port:
                  number: 80
    - host: api.k8s-0126.fl.test
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: api
                port:
                  number: 80
```

**3. Apply the updated Ingress:**

```bash
kubectl apply -f ingress.yaml
```

**4. Verify both routes:**

```bash
kubectl describe ingress web -n fl-k8s-0126
```

Both hostnames should appear in the `Rules` section.

**5. Test manually:**

```bash
kubectl exec grader-client -n fl-k8s-0126 -- \
  curl --silent \
  --connect-to api.k8s-0126.fl.test::traefik.traefik-system.svc.cluster.local:80 \
  http://api.k8s-0126.fl.test/
```

Expected: response body contains `api-backend`.

## Reference

- [Ingress rules](https://kubernetes.io/docs/concepts/services-networking/ingress/#ingress-rules)
- [Name-based virtual hosting](https://kubernetes.io/docs/concepts/services-networking/ingress/#name-based-virtual-hosting)
