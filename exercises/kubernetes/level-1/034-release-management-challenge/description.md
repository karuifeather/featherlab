## Level 1 Mastery Exercise

This exercise brings together everything from the deployment lifecycle sequence: reading rollout history, rolling back to a specific revision, and resuming a paused Deployment.

## Situation

The `platform` Deployment in `fl-k8s-0034` is in a broken state:

- It is currently **paused** (someone paused it during an incident)
- The current Pod template uses an image with a typo in the tag that cannot be pulled
- The rollout history contains the last known-good revision

Your job is to diagnose the state completely, choose the correct recovery actions, and leave the Deployment healthy and unpaused.

Useful commands to start your diagnosis:

```
kubectl get deployment platform -n fl-k8s-0034 -o yaml
kubectl rollout history deployment/platform -n fl-k8s-0034
kubectl get pods -n fl-k8s-0034
```

## What to do

1. Inspect the rollout history and identify which revision has the last known-good image.
2. Resume the Deployment so rollouts can proceed.
3. Roll back to the correct revision (`--to-revision=N`).
4. Confirm the rollout completes with 2 available replicas.

Official documentation: [Rolling Back a Deployment](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#rolling-back-a-deployment), [Pausing and Resuming](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#pausing-and-resuming-a-deployment)
