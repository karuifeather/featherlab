# Ingress Routing Troubleshooting

## Why traffic can silently fail

An Ingress resource is just a configuration object. The Kubernetes API server accepts it even
if it refers to a non-existent IngressClass or a wrong Service. The routing controller
(Traefik) only processes Ingresses that claim its own class via `spec.ingressClassName`. If the
class name is wrong, Traefik silently ignores the Ingress — no error, no event, no response
to clients beyond a 404 from Traefik's catch-all.

This makes IngressClass mismatches one of the most common "why doesn't routing work?" problems.

## Diagnostic steps

**1. Check what IngressClasses exist:**

```bash
kubectl get ingressclass
```

In this cluster, only `traefik` is installed. Any Ingress that specifies a different class
name will be orphaned.

**2. Check the Ingress's declared class:**

```bash
kubectl describe ingress <name> -n <namespace>
```

Look at `Ingress Class:` near the top. If it does not match an installed IngressClass, the
Ingress is ignored by all controllers.

**3. Check controller logs (optional, for deeper diagnosis):**

```bash
kubectl logs -n traefik-system deployment/traefik --tail=50
```

Traefik logs new Ingress events when it picks one up. Silence here confirms the Ingress is
not being processed.

## The starting state

Namespace `fl-k8s-0129` has:

- Deployment `app` + Service `app` (port **8080** → container port 80) — nginx
- Ingress `app` — routes `app.k8s-0129.fl.test/` → `app:8080`, but with `ingressClassName: nginx`
- Pod `grader-client`

The backend is correctly configured (port 8080 matches the Service's port). The only problem
is `ingressClassName: nginx` — there is no `nginx` IngressClass in this cluster.

## The task

Investigate why traffic is not routing and fix the `ingressClassName`.

**1. Confirm the installed IngressClasses:**

```bash
kubectl get ingressclass
```

Only `traefik` should appear.

**2. Inspect the Ingress:**

```bash
kubectl describe ingress app -n fl-k8s-0129
```

Note the `Ingress Class: nginx` line.

**3. Fix the ingressClassName:**

```bash
kubectl edit ingress app -n fl-k8s-0129
```

Change `ingressClassName: nginx` to `ingressClassName: traefik`. Save and exit.

**4. Wait for Traefik to reconcile** (a few seconds), then test:

```bash
kubectl exec grader-client -n fl-k8s-0129 -- \
  curl --silent \
  --connect-to app.k8s-0129.fl.test::traefik.traefik-system.svc.cluster.local:80 \
  http://app.k8s-0129.fl.test/
```

Expected: nginx welcome page.

## Reference

- [IngressClass](https://kubernetes.io/docs/concepts/services-networking/ingress/#ingress-class)
- [`kubectl get ingressclass`](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_get/)
