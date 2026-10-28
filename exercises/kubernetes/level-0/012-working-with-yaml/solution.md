```yaml
# notes.yaml
apiVersion: v1
kind: Pod
metadata:
  name: notes
  namespace: fl-k8s-0012
  labels: { app: notes, tier: frontend }
spec:
  containers:
    - name: web
      image: nginx:1.27
```

```bash
kubectl apply -f notes.yaml
kubectl wait --for=condition=Ready pod/notes -n fl-k8s-0012 --timeout=120s
```

Common mistake: `kubectl run notes --image=nginx:1.27 --labels=...` names the container
`notes`, not `web`.
