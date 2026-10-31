Create the Deployment with a shared emptyDir volume:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: fl-k8s-0062
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
      volumes:
        - name: logs
          emptyDir: {}
      initContainers:
        - name: log-collector
          image: busybox:1.36
          restartPolicy: Always
          command: ["sh", "-c", "while true; do echo collecting; sleep 5; done"]
          volumeMounts:
            - name: logs
              mountPath: /collected-logs
      containers:
        - name: app
          image: nginx:1.27
          volumeMounts:
            - name: logs
              mountPath: /var/log/app
```

Apply and verify:

```bash
kubectl apply -f app.yaml
kubectl rollout status deployment/app -n fl-k8s-0062
kubectl get deploy app -n fl-k8s-0062
# READY: 1/1
```

Confirm the shared mount with:

```bash
kubectl exec -n fl-k8s-0062 deploy/app -c app -- ls /var/log/app
```
