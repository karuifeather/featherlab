# Route by Path

## Path-based routing

When multiple Services live behind a single hostname, you can route them by URL path instead
of separate hostnames. One Ingress rule entry for `example.com` can hold multiple path entries:

```yaml
rules:
  - host: example.com
    http:
      paths:
        - path: /app
          pathType: Prefix
          backend: ...
        - path: /api
          pathType: Prefix
          backend: ...
```

Traefik matches incoming requests first by `Host` header, then by path.

## Exact vs Prefix

| pathType | Matches                                            |
| -------- | -------------------------------------------------- |
| `Prefix` | `/api` matches `/api`, `/api/`, `/api/users`, etc. |
| `Exact`  | `/api` matches only `/api` exactly                 |

Use `Prefix` when you want to capture an entire subtree of the URL space.

## Important: Traefik forwards the full path

Unlike some other Ingress controllers, Traefik **does not strip the path prefix** before
forwarding to the backend. A request to `/app/foo` arrives at the backend Service as `/app/foo`,
not `/foo`. The backends in this exercise are configured to accept any path and return a fixed
marker string, so this detail does not affect the outcome here — but it matters when your
application expects paths relative to a subpath.

## The starting state

Namespace `fl-k8s-0127` contains:

- Deployment `app` + Service `app:80` — returns `app-response` for any request
- Deployment `api` + Service `api:80` — returns `api-response` for any request
- Ingress `web` — routes `k8s-0127.fl.test/app` (Prefix) → `app:80` (already configured)
- Pod `grader-client`

The `/app` route works. The `/api` route is missing.

## The task

Add a path rule for `/api` (pathType `Prefix`) → Service `api:80` to the existing Ingress.

**1. Retrieve the current Ingress:**

```bash
kubectl get ingress web -n fl-k8s-0127 -o yaml > ingress.yaml
```

**2. Add the `/api` path** inside `spec.rules[0].http.paths`:

```yaml
spec:
  ingressClassName: traefik
  rules:
    - host: k8s-0127.fl.test
      http:
        paths:
          - path: /app
            pathType: Prefix
            backend:
              service:
                name: app
                port:
                  number: 80
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: api
                port:
                  number: 80
```

**3. Apply:**

```bash
kubectl apply -f ingress.yaml
```

**4. Verify:**

```bash
kubectl describe ingress web -n fl-k8s-0127
```

**5. Test both paths:**

```bash
kubectl exec grader-client -n fl-k8s-0127 -- \
  curl --silent \
  --connect-to k8s-0127.fl.test::traefik.traefik-system.svc.cluster.local:80 \
  http://k8s-0127.fl.test/app

kubectl exec grader-client -n fl-k8s-0127 -- \
  curl --silent \
  --connect-to k8s-0127.fl.test::traefik.traefik-system.svc.cluster.local:80 \
  http://k8s-0127.fl.test/api
```

Expected: first returns `app-response`, second returns `api-response`.

## Reference

- [Ingress path types](https://kubernetes.io/docs/concepts/services-networking/ingress/#path-types)
