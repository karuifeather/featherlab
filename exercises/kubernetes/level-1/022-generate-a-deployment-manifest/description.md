## Background

Generating a Deployment manifest with `--dry-run=client -o yaml` and editing it is faster and less error-prone than writing YAML from scratch. The generated skeleton has correct structure and defaults; you only change what you need.

```
kubectl create deployment <name> --image=<image> --replicas=N \
  --dry-run=client -o yaml > manifest.yaml
```

After editing, `kubectl apply -f manifest.yaml` creates or updates the resource.

`kubectl explain deployment.spec.template.metadata.labels` shows valid fields and their types without leaving the terminal.

## Task

Create a Deployment named `api-server` in namespace `fl-k8s-0022` that meets these requirements:

| Field                        | Required value |
| ---------------------------- | -------------- |
| Container name               | `api`          |
| Container image              | `nginx:1.27`   |
| Replicas                     | 2              |
| Pod template label `app`     | `api-server`   |
| Pod template label `version` | `v1`           |

Use `--dry-run=client -o yaml` to generate the starting manifest, then edit it before applying. FeatherLab grades the resulting cluster state, not the exact method you used.

Official documentation: [kubectl create deployment](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_create/kubectl_create_deployment/), [kubectl explain](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_explain/)
