A Deployment named `app` in `fl-k8s-0059` has been deployed with a broken init container. The
Pod never starts because `precheck` always exits with a non-zero code, keeping the deployment
stuck in `Init:CrashLoopBackOff`.

**Diagnosing the problem**

```bash
kubectl get pods -n fl-k8s-0059
# STATUS: Init:CrashLoopBackOff or Init:Error

kubectl logs <pod-name> -c precheck -n fl-k8s-0059
# View the init container's output

kubectl describe pod <pod-name> -n fl-k8s-0059
# Check "Init Containers" section for exit code
```

**Fixing a Deployment's init container**

Unlike a bare Pod, a Deployment's pod template can be patched and Kubernetes will roll out a new
Pod. Patch the init container's command to one that succeeds:

```bash
kubectl patch deployment app -n fl-k8s-0059 --type=json \
  -p='[{"op":"replace","path":"/spec/template/spec/initContainers/0/command",
        "value":["sh","-c","echo ready && exit 0"]}]'
```

Then watch the rollout:

```bash
kubectl rollout status deployment/app -n fl-k8s-0059
```

Once the init container exits 0, the main container (`nginx:1.27`) starts and the Pod becomes
Ready.
