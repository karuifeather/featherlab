# Solution

**1. Confirm the problem:**

```bash
kubectl describe ingress web -n fl-k8s-0128
```

Output includes:

```
webserver:80 (<error: endpoints "webserver" not found>)
```

**2. Fix using kubectl edit:**

```bash
kubectl edit ingress web -n fl-k8s-0128
```

Find the line `name: webserver` under `spec.rules[0].http.paths[0].backend.service` and change
it to `name: web`. Save and exit.

**Declarative fix** — apply the corrected manifest:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
  namespace: fl-k8s-0128
spec:
  ingressClassName: traefik
  rules:
    - host: app.k8s-0128.fl.test
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

```bash
kubectl apply -f ingress.yaml
```

**3. Verify:**

```bash
kubectl describe ingress web -n fl-k8s-0128
```

The backend should now show `web:80 (<some-ip>:80)` without an error.

**4. Test:**

```bash
kubectl exec grader-client -n fl-k8s-0128 -- \
  curl --silent \
  --connect-to app.k8s-0128.fl.test::traefik.traefik-system.svc.cluster.local:80 \
  http://app.k8s-0128.fl.test/
```

Expected output contains `Welcome to nginx!`.

**Root cause:** The Ingress backend `service.name` must exactly match the name of an existing
Service in the same namespace. A typo (`webserver` vs `web`) is silently accepted by the API
server but causes the Ingress controller to fail at routing time.
