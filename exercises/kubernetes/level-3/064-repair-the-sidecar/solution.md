Inspect the broken command:

```bash
kubectl describe deployment backend -n fl-k8s-0064
# Look for the initContainers section — the monitor command calls exit 1
```

Patch the native sidecar command:

```bash
kubectl patch deployment backend -n fl-k8s-0064 --type=json \
  -p='[{"op":"replace","path":"/spec/template/spec/initContainers/0/command","value":["sh","-c","while true; do sleep 30; done"]}]'
```

Wait for the rollout:

```bash
kubectl rollout status deployment/backend -n fl-k8s-0064
```
