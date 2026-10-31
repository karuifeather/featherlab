```bash
kubectl apply -n fl-k8s-0091 -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: worker
  namespace: fl-k8s-0091
spec:
  replicas: 2
  selector:
    matchLabels:
      app: worker
  template:
    metadata:
      labels:
        app: worker
    spec:
      affinity:
        nodeAffinity:
          preferredDuringSchedulingIgnoredDuringExecution:
            - weight: 10
              preference:
                matchExpressions:
                  - key: kubernetes.io/arch
                    operator: In
                    values:
                      - amd64
      containers:
        - name: app
          image: nginx:1.27
          resources:
            requests:
              cpu: "50m"
              memory: "32Mi"
EOF

kubectl rollout status deployment/worker -n fl-k8s-0091 --timeout=120s
```
