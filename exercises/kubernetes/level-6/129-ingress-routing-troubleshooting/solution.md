# Solution

**1. Confirm the only installed IngressClass:**

```bash
kubectl get ingressclass
```

Output:

```
NAME      CONTROLLER                      PARAMETERS   AGE
traefik   traefik.io/ingress-controller   <none>       ...
```

**2. Inspect the broken Ingress:**

```bash
kubectl describe ingress app -n fl-k8s-0129
```

Key line:

```
Ingress Class:  nginx
```

`nginx` does not match any installed IngressClass. Traefik is ignoring this Ingress.

**3. Fix the ingressClassName:**

```bash
kubectl edit ingress app -n fl-k8s-0129
```

Change `ingressClassName: nginx` → `ingressClassName: traefik`. Save and exit.

**Declarative fix:**

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: app
  namespace: fl-k8s-0129
spec:
  ingressClassName: traefik
  rules:
    - host: app.k8s-0129.fl.test
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: app
                port:
                  number: 8080
```

```bash
kubectl apply -f ingress.yaml
```

**4. Verify Traefik picked it up:**

```bash
kubectl describe ingress app -n fl-k8s-0129
```

`Ingress Class: traefik` should now appear, and the backend will show without a `not found` error.

**5. Test:**

```bash
kubectl exec grader-client -n fl-k8s-0129 -- \
  curl --silent \
  --connect-to app.k8s-0129.fl.test::traefik.traefik-system.svc.cluster.local:80 \
  http://app.k8s-0129.fl.test/
```

Expected output contains `Welcome to nginx!`.

**Root cause:** `spec.ingressClassName` is the claim that binds an Ingress to a specific
controller. A wrong class name causes silent failure — the Ingress is accepted by the API
server but processed by no controller. Always verify the available IngressClasses with
`kubectl get ingressclass` before creating Ingress resources.
