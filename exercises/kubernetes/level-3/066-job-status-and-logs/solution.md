```bash
kubectl get job data-processor -n fl-k8s-0066
kubectl logs job/data-processor -n fl-k8s-0066
kubectl create job summary-job --image=busybox:1.36 -n fl-k8s-0066 -- sh -c 'echo summary-done'
kubectl wait --for=condition=complete job/summary-job -n fl-k8s-0066 --timeout=120s
```
