```bash
kubectl autoscale deployment web \
  --cpu-percent=60 --min=2 --max=10 \
  --name=web-hpa \
  -n fl-k8s-0095
```

Or with a manifest:

```yaml
# web-hpa.yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: web-hpa
  namespace: fl-k8s-0095
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: web
  minReplicas: 2
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 60
```

```bash
kubectl apply -f web-hpa.yaml
kubectl describe hpa web-hpa -n fl-k8s-0095
```
