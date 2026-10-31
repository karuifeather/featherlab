Inspect `data-probe`'s output:

```bash
kubectl logs data-probe -n fl-k8s-0055
# inspection-complete
```

Create the `inspector` Pod:

```bash
kubectl run inspector \
  --image=busybox:1.36 \
  --restart=Never \
  -n fl-k8s-0055 \
  --command -- echo "found it"
```

Wait for it to finish:

```bash
kubectl wait pod/inspector -n fl-k8s-0055 \
  --for=jsonpath={.status.phase}=Succeeded \
  --timeout=60s
```

Both `data-probe` and `inspector` are now in phase `Succeeded`. `kubectl logs` works on
completed Pods because Kubernetes retains their container output until the Pod is deleted.
