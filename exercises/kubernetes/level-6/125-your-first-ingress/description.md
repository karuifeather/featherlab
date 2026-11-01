# Your First Ingress

## Why Services are not enough for HTTP traffic

A `ClusterIP` Service makes a workload reachable from inside the cluster. But to expose an
application to external HTTP traffic — or to route different hostnames and paths to different
backends — you need one more layer: an **Ingress**.

An Ingress is a Kubernetes resource (`networking.k8s.io/v1`) that declares HTTP routing rules.
By itself it does nothing. A running **Ingress controller** watches Ingress objects and programs
an actual reverse proxy (in this cluster, Traefik) to forward traffic according to those rules.

```
client → Traefik (IngressController) → Service → Pods
              ↑
        reads Ingress rules
```

## The ingressClassName field

Multiple Ingress controllers can run in the same cluster. Each Ingress must declare which
controller owns it via `spec.ingressClassName`. In this cluster the controller is Traefik and
its class name is **`traefik`**. An Ingress with a wrong or missing class is silently ignored
by all controllers.

## How routing works

An Ingress rule has three parts:

1. **host** — the HTTP `Host` header value the request must carry (e.g. `app.example.com`).
2. **path** — the URL path prefix or exact path to match.
3. **backend** — the Service name and port to forward matching requests to.

The `pathType` controls matching: `Prefix` matches the path and any sub-path; `Exact` requires
an exact match.

## The task

A `web` Deployment and Service are already running in namespace `fl-k8s-0125`. Create an
Ingress named `web` that routes HTTP requests for `app.k8s-0125.fl.test` to the `web` Service
on port 80.

**1. Write the Ingress manifest** (`ingress.yaml`):

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

**2. Apply it:**

```bash
kubectl apply -f ingress.yaml
```

**3. Verify the Ingress:**

```bash
kubectl describe ingress web -n fl-k8s-0125
```

Look for the `Rules` section confirming the host and backend, and for the backend line showing
the Service reference without errors once the controller has reconciled the rule.

**4. Test routing manually:**

```bash
kubectl exec grader-client -n fl-k8s-0125 -- \
  curl --silent \
  --connect-to app.k8s-0125.fl.test::traefik.traefik-system.svc.cluster.local:80 \
  http://app.k8s-0125.fl.test/
```

You should see the nginx welcome page.

## Reference

- [Ingress overview](https://kubernetes.io/docs/concepts/services-networking/ingress/)
- [IngressClass](https://kubernetes.io/docs/concepts/services-networking/ingress/#ingress-class)
