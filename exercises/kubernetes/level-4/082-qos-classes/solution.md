```yaml
# pod-guaranteed.yaml
apiVersion: v1
kind: Pod
metadata:
  name: qos-guaranteed
  namespace: fl-k8s-0082
spec:
  containers:
    - name: app
      image: busybox:1.36
      command: ["sh", "-c", "sleep 3600"]
      resources:
        requests:
          cpu: "100m"
          memory: "64Mi"
        limits:
          cpu: "100m"
          memory: "64Mi"
```

```bash
kubectl apply -f pod-guaranteed.yaml
kubectl wait pod/qos-guaranteed -n fl-k8s-0082 --for=condition=Ready --timeout=120s
kubectl get pod qos-guaranteed -n fl-k8s-0082 -o jsonpath='{.status.qosClass}'
```
