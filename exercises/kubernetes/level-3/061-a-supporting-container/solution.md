Create the Deployment with the native sidecar in `initContainers[]`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: fl-k8s-0061
spec:
  replicas: 1
  selector:
    matchLabels:
      app: app
  template:
    metadata:
      labels:
        app: app
    spec:
      initContainers:
        - name: logger
          image: busybox:1.36
          restartPolicy: Always
          command: ["sh", "-c", "while true; do echo logging; sleep 5; done"]
      containers:
        - name: app
          image: nginx:1.27
```

Apply and verify:

```bash
kubectl apply -f app.yaml
kubectl rollout status deployment/app -n fl-k8s-0061
kubectl get deploy app -n fl-k8s-0061
# READY: 1/1
```

The `logger` container will appear in `kubectl describe pod` under `Init Containers` but runs
continuously alongside `app`, which is the native sidecar behaviour.
