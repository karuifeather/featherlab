# Solution

Export the current Ingress, add the `api` rule, and re-apply:

```bash
kubectl get ingress web -n fl-k8s-0126 -o yaml > ingress.yaml
```

Edit `ingress.yaml` so `spec.rules` contains both hostnames:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
  namespace: fl-k8s-0126
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

Apply:

```bash
kubectl apply -f ingress.yaml
```

Verify:

```bash
kubectl describe ingress web -n fl-k8s-0126
```

Test both routes:

```bash
kubectl exec grader-client -n fl-k8s-0126 -- \
  curl --silent \
  --connect-to frontend.k8s-0126.fl.test::traefik.traefik-system.svc.cluster.local:80 \
  http://frontend.k8s-0126.fl.test/

kubectl exec grader-client -n fl-k8s-0126 -- \
  curl --silent \
  --connect-to api.k8s-0126.fl.test::traefik.traefik-system.svc.cluster.local:80 \
  http://api.k8s-0126.fl.test/
```

Expected outputs: first contains `frontend`, second contains `api-backend`.

**Alternative — apply a complete manifest directly:**

```bash
kubectl apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
  namespace: fl-k8s-0126
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
EOF
```
