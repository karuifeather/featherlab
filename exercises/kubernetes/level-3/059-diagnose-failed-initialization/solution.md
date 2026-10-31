Diagnose the stuck pod:

```bash
kubectl get pods -n fl-k8s-0059
# NAME                   READY   STATUS                  RESTARTS
# app-xxx                0/1     Init:CrashLoopBackOff   3

kubectl logs <pod-name> -c precheck -n fl-k8s-0059
# (no output — the command exits 1 immediately)
```

The init container `precheck` always exits with code 1. Fix it by patching the Deployment's
init container command:

```bash
kubectl patch deployment app -n fl-k8s-0059 --type=json \
  -p='[{"op":"replace","path":"/spec/template/spec/initContainers/0/command",
        "value":["sh","-c","echo ready && exit 0"]}]'
```

Or use `kubectl edit deployment app -n fl-k8s-0059` and change the command manually.

Watch the rollout complete:

```bash
kubectl rollout status deployment/app -n fl-k8s-0059
```

The patched Deployment creates a new pod. Its init container now exits 0, so nginx starts and
the pod becomes Ready.
