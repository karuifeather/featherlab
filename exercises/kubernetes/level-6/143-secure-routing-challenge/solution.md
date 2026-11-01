# Solution

Edit Gateway `secure-gw` and add the HTTPS listener named `https`:

```bash
kubectl apply -n fl-k8s-0143 -f - <<'EOF'
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: secure-gw
  namespace: fl-k8s-0143
spec:
  gatewayClassName: traefik
  listeners:
    - name: http
      port: 80
      protocol: HTTP
      hostname: "app.k8s-0143.fl.test"
    - name: https
      port: 443
      protocol: HTTPS
      hostname: "app.k8s-0143.fl.test"
      tls:
        mode: Terminate
        certificateRefs:
          - name: app-tls
            kind: Secret
EOF
```

Verify the Gateway is Programmed and the HTTPRoute is Accepted:

```bash
kubectl get gateway secure-gw -n fl-k8s-0143 \
  -o jsonpath='{.status.conditions[?(@.type=="Programmed")].status}'
# Expected: True

kubectl get httproute app-route -n fl-k8s-0143 \
  -o jsonpath='{.status.parents[0].conditions[?(@.type=="Accepted")].status}'
# Expected: True
```

Test HTTPS connectivity:

```bash
kubectl exec grader-client -n fl-k8s-0143 -- \
  curl --silent --insecure \
  --connect-to app.k8s-0143.fl.test::traefik.traefik-system.svc.cluster.local:443 \
  https://app.k8s-0143.fl.test/
# Expected: secure-app
```
