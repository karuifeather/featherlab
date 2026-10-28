## Background

Not every broken Deployment has a safe rollback available. Three recovery tools, and when to
reach for each:

| Tool                              | When to use                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `kubectl rollout undo`            | A previous working revision exists (`revisionHistoryLimit > 0`)                                              |
| `kubectl set image` (fix forward) | No prior revision, or the fix is a specific known-good image                                                 |
| `kubectl rollout restart`         | Pods are healthy but stale (e.g., refreshing a ConfigMap-backed env var) — does NOT help an image pull error |

Check before acting:

```
kubectl rollout history deployment/<name> -n <ns>   # how many revisions?
kubectl get pods -n <ns>                             # what error are they showing?
kubectl describe pod <pod> -n <ns>                  # ImagePullBackOff? OOMKilled? CrashLoopBackOff?
```

## Situation

The `auth` Deployment in `fl-k8s-0032` has broken Pods. Inspect the Deployment to understand
what is wrong and what recovery options are available:

- Check `kubectl rollout history deployment/auth -n fl-k8s-0032` — is a rollback possible?
- Check `kubectl get pods -n fl-k8s-0032` — what is the error?

Once you have diagnosed the problem, choose the correct recovery action.

Official documentation: [Troubleshooting Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#failed-deployment)
