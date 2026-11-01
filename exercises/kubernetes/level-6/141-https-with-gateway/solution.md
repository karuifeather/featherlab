# Solution

Edit Gateway `web-gw` and add the HTTPS listener:

```bash
kubectl apply -n fl-k8s-0141 -f - <<'EOF'
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: web-gw
  namespace: fl-k8s-0141
spec:
  gatewayClassName: traefik
  listeners:
    - name: http
      port: 80
      protocol: HTTP
      hostname: "app.k8s-0141.fl.test"
    - name: https
      port: 443
      protocol: HTTPS
      hostname: "app.k8s-0141.fl.test"
      tls:
        mode: Terminate
        certificateRefs:
          - name: app-tls
            kind: Secret
EOF
```

Verify the Gateway is Programmed with both listeners:

```bash
kubectl get gateway web-gw -n fl-k8s-0141 -o jsonpath='{.status.conditions}'
kubectl get gateway web-gw -n fl-k8s-0141 -o jsonpath='{.status.listeners[*].name}'
```

Test HTTPS connectivity:

```bash
kubectl exec grader-client -n fl-k8s-0141 -- \
  curl --silent --insecure \
  --connect-to app.k8s-0141.fl.test::traefik.traefik-system.svc.cluster.local:443 \
  https://app.k8s-0141.fl.test/
# Expected: web-response
```
