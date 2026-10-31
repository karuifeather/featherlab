```bash
kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: logger
  namespace: fl-k8s-0080
spec:
  replicas: 1
  selector:
    matchLabels:
      app: logger
  template:
    metadata:
      labels:
        app: logger
    spec:
      containers:
        - name: main
          image: busybox:1.36
          command: ["sh", "-c", "sleep 3600"]
          resources:
            requests:
              cpu: "200m"
              memory: "128Mi"
            limits:
              cpu: "500m"
              memory: "256Mi"
EOF
kubectl rollout status deployment/logger -n fl-k8s-0080 --timeout=120s
```
