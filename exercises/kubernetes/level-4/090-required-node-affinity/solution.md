```bash
kubectl apply -n fl-k8s-0090 -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cache
  namespace: fl-k8s-0090
spec:
  replicas: 1
  selector:
    matchLabels:
      app: cache
  template:
    metadata:
      labels:
        app: cache
    spec:
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
              - matchExpressions:
                  - key: kubernetes.io/os
                    operator: In
                    values:
                      - linux
      containers:
        - name: app
          image: nginx:1.27
          resources:
            requests:
              cpu: "50m"
              memory: "32Mi"
EOF

kubectl rollout status deployment/cache -n fl-k8s-0090 --timeout=120s
```
