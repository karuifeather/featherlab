# Fix the Backend

## What happens when the backend Service does not exist

An Ingress can reference any Service name — the Kubernetes API server does not validate that
the named Service actually exists. Traefik (the Ingress controller) tries to resolve the backend
at reconciliation time. When the Service is missing, Traefik logs a warning and returns a
**503 Service Unavailable** (or a 404 depending on the error) to incoming requests.

The symptom is clear when you inspect the Ingress:

```
kubectl describe ingress web -n <namespace>
```

Look for an error annotation on the backend line:

```
Rules:
  Host                       Path  Backends
  ----                       ----  --------
  app.k8s-0128.fl.test
                             /     webserver:80 (<error: endpoints "webserver" not found>)
```

This tells you exactly which Service Traefik cannot find.

## The starting state

Namespace `fl-k8s-0128` has:

- Deployment `web` + Service `web:80` — running nginx
- Ingress `web` — routes `app.k8s-0128.fl.test` → Service `webserver:80` (typo!)
- Pod `grader-client`

The Service is named `web`, but the Ingress references `webserver`. Traffic to
`app.k8s-0128.fl.test` fails because the backend does not exist.

## The task

Fix the Ingress so it references Service `web:80` instead of `webserver:80`.

**1. Confirm the problem:**

```bash
kubectl describe ingress web -n fl-k8s-0128
```

Verify you see the `endpoints "webserver" not found` error.

**2. Fix the backend** — edit the Ingress in place:

```bash
kubectl edit ingress web -n fl-k8s-0128
```

Change `name: webserver` to `name: web` under `spec.rules[0].http.paths[0].backend.service`.

Or export, edit, and re-apply:

```bash
kubectl get ingress web -n fl-k8s-0128 -o yaml > ingress.yaml
# edit ingress.yaml: change webserver → web
kubectl apply -f ingress.yaml
```

**3. Verify the fix:**

```bash
kubectl describe ingress web -n fl-k8s-0128
```

The backend should now show `web:80` with no error.

**4. Test:**

```bash
kubectl exec grader-client -n fl-k8s-0128 -- \
  curl --silent \
  --connect-to app.k8s-0128.fl.test::traefik.traefik-system.svc.cluster.local:80 \
  http://app.k8s-0128.fl.test/
```

Expected: nginx welcome page.

## Reference

- [Ingress backends](https://kubernetes.io/docs/concepts/services-networking/ingress/#the-ingress-resource)
- [`kubectl describe ingress`](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_describe/)
