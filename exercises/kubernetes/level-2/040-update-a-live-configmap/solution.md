Edit the ConfigMap to update the feature flag:

```bash
kubectl edit configmap runtime-config -n fl-k8s-0040
```

Change `FEATURE_FLAG: "disabled"` to `FEATURE_FLAG: "enabled"` and save.

Alternatively, use a patch:

```bash
kubectl patch configmap runtime-config -n fl-k8s-0040 \
  --type=merge -p '{"data":{"FEATURE_FLAG":"enabled"}}'
```

Verify the update:

```bash
kubectl get configmap runtime-config -n fl-k8s-0040 -o yaml
```

Restart the Deployment so pods pick up the new env var value:

```bash
kubectl rollout restart deployment/app -n fl-k8s-0040
```

Confirm the rollout completes:

```bash
kubectl rollout status deployment/app -n fl-k8s-0040
```
