# Solution

Retrieve the current Ingress and add the `/api` path entry:

```bash
kubectl get ingress web -n fl-k8s-0127 -o yaml > ingress.yaml
```

Edit `ingress.yaml` so `spec.rules[0].http.paths` contains both paths:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
  namespace: fl-k8s-0127
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

Apply:

```bash
kubectl apply -f ingress.yaml
```

Verify both rules appear in the output of:

```bash
kubectl describe ingress web -n fl-k8s-0127
```

Test each path:

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

**Key points:**

- Both paths live inside the same `spec.rules` entry (same host). Adding a second rule entry
  for the same host also works, but a single entry with multiple `paths` is the idiomatic form.
- `pathType: Prefix` means `/api` matches `/api`, `/api/`, `/api/v1`, etc.
- Traefik does not strip the prefix; the backend receives the full path `/app` or `/api`.
