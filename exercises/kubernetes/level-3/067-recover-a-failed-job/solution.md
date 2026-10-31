```bash
kubectl describe job batch -n fl-k8s-0067
kubectl delete job batch -n fl-k8s-0067
```

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: batch
  namespace: fl-k8s-0067
spec:
  backoffLimit: 2
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: batch
          image: busybox:1.36
          command: ["sh", "-c", "echo batch-done"]
```
