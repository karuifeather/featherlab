```bash
kubectl apply -n fl-k8s-0088 -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: scanner
  namespace: fl-k8s-0088
spec:
  replicas: 2
  selector:
    matchLabels:
      app: scanner
  template:
    metadata:
      labels:
        app: scanner
    spec:
      nodeSelector:
        kubernetes.io/arch: amd64
      containers:
        - name: app
          image: nginx:1.27
          resources:
            requests:
              cpu: "50m"
              memory: "32Mi"
EOF
kubectl rollout status deployment/scanner -n fl-k8s-0088 --timeout=120s
```
