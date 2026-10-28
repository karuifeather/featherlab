## Background

`kubectl set image` updates one or more container images in a Deployment without editing the full manifest:

```
kubectl set image deployment/<name> <container>=<new-image> -n <namespace>
```

After running this command, Kubernetes begins a **rolling update**: new Pods with the updated image are created while old Pods are gradually removed. Use `kubectl rollout status` to watch progress.

The container name in the command (`web=...`) must match the name defined in the Deployment's `spec.template.spec.containers[*].name`.

## Task

The `storefront` Deployment in `fl-k8s-0023` currently runs `nginx:1.27`. The team has decided to switch to the Alpine-based variant, which is smaller. Update the `web` container to `nginx:1.27-alpine` and verify the rollout completes successfully.

Official documentation: [kubectl set image](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_set/kubectl_set_image/), [Updating a Deployment](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#updating-a-deployment)
