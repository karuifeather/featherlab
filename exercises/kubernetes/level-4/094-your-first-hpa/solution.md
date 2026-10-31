```bash
kubectl autoscale deployment app-server \
  --cpu-percent=80 --min=1 --max=5 \
  --name=app-server-hpa \
  -n fl-k8s-0094
```

Or with a manifest:

```yaml
# app-server-hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: app-server-hpa
  namespace: fl-k8s-0094
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: app-server
  minReplicas: 1
  maxReplicas: 5
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 80
```

```bash
kubectl apply -f app-server-hpa.yaml
kubectl describe hpa app-server-hpa -n fl-k8s-0094
```

The `<unknown>/80%` in the Metrics column is expected — it means metrics-server is not installed and the HPA cannot yet read live CPU usage.
