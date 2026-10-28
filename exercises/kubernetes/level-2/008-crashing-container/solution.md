Diagnosis: Pods are in `CrashLoopBackOff` (`Last State: Terminated, Exit Code: 1`).
`kubectl logs <pod> --previous` shows
`[emerg] unknown directive "server_nmae" in /etc/nginx/conf.d/default.conf:3`.

```bash
kubectl edit configmap gateway-config -n fl-k8s-0008     # server_nmae -> server_name
kubectl rollout restart deployment/gateway -n fl-k8s-0008
kubectl rollout status deployment/gateway -n fl-k8s-0008
```

Removing the volume makes nginx start with its default site, which has no `/healthz`, so the
Pods never become Ready. Deleting the readiness probe fails the probe check.
