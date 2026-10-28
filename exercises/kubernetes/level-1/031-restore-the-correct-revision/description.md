## Background

`kubectl rollout history` shows all retained revisions. With `--revision=N` you can inspect the
exact Pod template for that revision — including the container image.

```
kubectl rollout history deployment/<name> -n <ns>
kubectl rollout history deployment/<name> -n <ns> --revision=2
```

When you need to restore a specific revision (not just `undo` to the previous one), use
`--to-revision=N`:

```
kubectl rollout undo deployment/<name> -n <ns> --to-revision=2
```

This is essential when you need to skip over a bad intermediate revision and go back further.

## Situation

The `catalog-api` Deployment in `fl-k8s-0031` has three revisions. The most recent revision
introduced a broken image (a typo in the tag). You need to inspect the history, find the last
_good_ revision, and restore the Deployment to it.

Use `kubectl rollout history` to identify which revision to restore, then target it with
`--to-revision`.

Official documentation: [Checking Rollout History](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#checking-rollout-history-of-a-deployment)
