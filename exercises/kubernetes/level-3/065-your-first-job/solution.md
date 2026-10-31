```bash
kubectl create job hello-job --image=busybox:1.36 -n fl-k8s-0065 -- sh -c 'echo hello from job'
kubectl wait --for=condition=complete job/hello-job -n fl-k8s-0065 --timeout=120s
```
