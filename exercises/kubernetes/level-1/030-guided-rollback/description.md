## Background

`kubectl rollout undo` reverts a Deployment to a previous revision. Each revision maps to a
ReplicaSet that Kubernetes keeps around (up to `revisionHistoryLimit`, default 10).

```
kubectl rollout history deployment/<name> -n <ns>
kubectl rollout undo deployment/<name> -n <ns>                 # previous revision
kubectl rollout undo deployment/<name> -n <ns> --to-revision=1 # specific revision
```

When a rollout gets stuck because a new image fails to pull, the old Pods keep running — the
Deployment does NOT remove them until new ones are Ready. This means a broken deployment usually
still serves traffic and a rollback is safe.

## Situation

The `gateway` Deployment in `fl-k8s-0030` has two revisions. The latest update changed the image
to `nginx:1.27-alpne` — a typo. That image doesn't exist, so Kubernetes cannot pull it and the
rollout is stuck.

You can confirm this:

```
kubectl describe deployment gateway -n fl-k8s-0030
kubectl get pods -n fl-k8s-0030  # some Pods may be in ImagePullBackOff
```

## Task

Inspect the rollout history to identify the working revision, then roll the Deployment back so
that all 2 replicas are running `nginx:1.27`.

Official documentation: [Rolling Back a Deployment](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#rolling-back-a-deployment)
