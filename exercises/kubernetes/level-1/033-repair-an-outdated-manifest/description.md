## Background

The `apps/v1beta1` API version for Deployments was deprecated in Kubernetes 1.9 and **removed in 1.16**. Any cluster running 1.16 or newer will reject manifests that use it.

When upgrading old manifests to `apps/v1`:

1. Change `apiVersion: apps/v1beta1` → `apiVersion: apps/v1`
2. Add `spec.selector.matchLabels` — this field is required in `apps/v1` but was optional in `v1beta1`

The selector must match the Pod template's `metadata.labels`.

```yaml
spec:
  selector:
    matchLabels:
      app: <name>
  template:
    metadata:
      labels:
        app: <name>
```

`kubectl explain deployment.spec.selector` describes the field.

## Situation

A ConfigMap named `legacy-manifest` in `fl-k8s-0033` stores an old Deployment manifest written for `apps/v1beta1`. Extract it, fix the API version and add the missing `selector`, then apply it.

```
kubectl get configmap legacy-manifest -n fl-k8s-0033 -o jsonpath='{.data.deployment\.yaml}'
```

Official documentation: [Deprecated API Migration Guide](https://kubernetes.io/docs/reference/using-api/deprecation-guide/#deployment-v116)
