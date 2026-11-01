# Solution

Edit Ingress `web` and add the `spec.tls` block:

```bash
kubectl apply -n fl-k8s-0140 -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
  namespace: fl-k8s-0140
spec:
  ingressClassName: traefik
  tls:
    - hosts:
        - app.k8s-0140.fl.test
      secretName: app-tls
  rules:
    - host: app.k8s-0140.fl.test
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

Verify the TLS stanza was accepted:

```bash
kubectl get ingress web -n fl-k8s-0140 -o jsonpath='{.spec.tls}'
```

Test HTTPS connectivity (certificate verification is skipped with `-k`/`--insecure`):

```bash
kubectl exec grader-client -n fl-k8s-0140 -- \
  curl --silent --insecure \
  --connect-to app.k8s-0140.fl.test::traefik.traefik-system.svc.cluster.local:443 \
  https://app.k8s-0140.fl.test/
# Expected: web-response
```
