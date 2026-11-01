# Solution

Create an Ingress that routes `app.k8s-0125.fl.test` to the `web` Service:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
  namespace: fl-k8s-0125
spec:
  ingressClassName: traefik
  rules:
    - host: app.k8s-0125.fl.test
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web
                port:
                  number: 80
```

Apply it:

```bash
kubectl apply -f ingress.yaml
```

Verify the Ingress was accepted:

```bash
kubectl describe ingress web -n fl-k8s-0125
```

The `Rules` section should show the host and backend. Traefik reconciles the rule within a few
seconds.

Test that traffic reaches nginx:

```bash
kubectl exec grader-client -n fl-k8s-0125 -- \
  curl --silent \
  --connect-to app.k8s-0125.fl.test::traefik.traefik-system.svc.cluster.local:80 \
  http://app.k8s-0125.fl.test/
```

Expected output contains `Welcome to nginx!`.

**Key points:**

- `spec.ingressClassName: traefik` tells Traefik to own this Ingress. Omitting it or using a
  wrong class name causes Traefik to ignore the rule silently.
- `pathType: Prefix` with `path: /` matches all requests to the host.
- The backend `service.port.number` must match the Service's `spec.ports[].port`, not the
  container's `containerPort`.
