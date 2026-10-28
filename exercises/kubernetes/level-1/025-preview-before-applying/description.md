## Background

Before applying a manifest change to a live cluster, it is good practice to preview what will change. Two complementary approaches:

| Command                                       | What it does                                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `kubectl apply --dry-run=client -f file.yaml` | Validates locally; no API call. Fast but can miss server-side constraints.                                               |
| `kubectl apply --dry-run=server -f file.yaml` | Sends to the API server for validation; reports admission errors.                                                        |
| `kubectl diff -f file.yaml`                   | Shows a unified diff of what the cluster would change to. Exit code 0 = no change; 1 = differences found (not an error). |

`kubectl diff` requires **server-side dry run** support. It is the clearest way to confirm your edit targets only the intended fields.

## Task

The `notification-svc` Deployment in `fl-k8s-0025` currently uses `nginx:1.27`. Prepare a manifest update that changes the `web` container to `nginx:1.27-alpine`.

1. Export the current manifest: `kubectl get deployment notification-svc -n fl-k8s-0025 -o yaml > /tmp/notif.yaml`
2. Edit `/tmp/notif.yaml` to change the image from `nginx:1.27` to `nginx:1.27-alpine`.
3. Preview the change: `kubectl diff -f /tmp/notif.yaml` (exit code 1 with diff output is expected and normal).
4. Apply: `kubectl apply -f /tmp/notif.yaml`
5. Confirm the rollout: `kubectl rollout status deployment/notification-svc -n fl-k8s-0025`

Official documentation: [kubectl diff](https://kubernetes.io/docs/reference/kubectl/generated/kubectl_diff/), [Server-side dry run](https://kubernetes.io/docs/reference/using-api/server-side-apply/#dry-run)
