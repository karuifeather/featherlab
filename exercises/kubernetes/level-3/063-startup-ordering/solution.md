Export and edit the Deployment:

```bash
kubectl get deployment web-app -n fl-k8s-0063 -o yaml > web-app.yaml
```

Edit `web-app.yaml`: move the `helper` container from `containers[]` to `initContainers[]` and add `restartPolicy: Always`:

```yaml
spec:
  template:
    spec:
      initContainers:
        - name: helper
          image: busybox:1.36
          restartPolicy: Always
          command: ["sh", "-c", "while true; do echo helping; sleep 10; done"]
      containers:
        - name: app
          image: nginx:1.27
```

Apply and wait for rollout:

```bash
kubectl apply -f web-app.yaml
kubectl rollout status deployment/web-app -n fl-k8s-0063
```
