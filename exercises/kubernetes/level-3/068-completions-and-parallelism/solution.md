```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: worker
  namespace: fl-k8s-0068
spec:
  completions: 4
  parallelism: 2
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: worker
          image: busybox:1.36
          command: ["sh", "-c", "echo worker-done"]
```
