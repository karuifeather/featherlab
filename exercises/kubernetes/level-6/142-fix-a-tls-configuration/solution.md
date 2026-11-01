# Solution

Edit Ingress `web` and change the TLS `secretName` from `wrong-tls-secret` to `correct-tls`:

```bash
kubectl apply -n fl-k8s-0142 -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
  namespace: fl-k8s-0142
spec:
  ingressClassName: traefik
  tls:
    - hosts:
        - app.k8s-0142.fl.test
      secretName: correct-tls
  rules:
    - host: app.k8s-0142.fl.test
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web
                port:
                  number: 80
EOF
```

Verify the Ingress has the correct TLS configuration:

```bash
kubectl get ingress web -n fl-k8s-0142 -o jsonpath='{.spec.tls}'
```

Test HTTPS connectivity:

```bash
kubectl exec grader-client -n fl-k8s-0142 -- \
  curl --silent --insecure \
  --connect-to app.k8s-0142.fl.test::traefik.traefik-system.svc.cluster.local:443 \
  https://app.k8s-0142.fl.test/
# Expected: web-response
```
