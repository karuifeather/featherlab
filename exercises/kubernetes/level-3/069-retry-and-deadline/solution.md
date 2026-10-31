Create the Job with both safety controls:

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: safe-task
  namespace: fl-k8s-0069
spec:
  backoffLimit: 3
  activeDeadlineSeconds: 60
  template:
    spec:
      restartPolicy: Never
      containers:
        - name: task
          image: busybox:1.36
          command: ["sh", "-c", "echo safe-done"]
```

Apply and wait:

```bash
kubectl apply -f safe-task.yaml
kubectl wait --for=condition=complete job/safe-task \
  -n fl-k8s-0069 \
  --timeout=120s
```

Verify:

```bash
kubectl get job safe-task -n fl-k8s-0069
# COMPLETIONS: 1/1
kubectl logs job/safe-task -n fl-k8s-0069
# safe-done
```

Check the spec fields were applied:

```bash
kubectl get job safe-task -n fl-k8s-0069 \
  -o jsonpath='{.spec.backoffLimit} {.spec.activeDeadlineSeconds}'
# 3 60
```
