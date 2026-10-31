```yaml
# api-gateway.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway
  namespace: fl-k8s-0097
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api-gateway
  template:
    metadata:
      labels:
        app: api-gateway
    spec:
      nodeSelector:
        kubernetes.io/os: linux
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
              - matchExpressions:
                  - key: kubernetes.io/arch
                    operator: In
                    values:
                      - amd64
      containers:
        - name: gateway
          image: nginx:1.27
          resources:
            requests:
              cpu: "100m"
              memory: "64Mi"
            limits:
              cpu: "300m"
              memory: "128Mi"
```

```bash
kubectl apply -f api-gateway.yaml
kubectl rollout status deployment/api-gateway -n fl-k8s-0097 --timeout=120s
kubectl get pods -n fl-k8s-0097 -o wide
```
