## Background

A Kubernetes Deployment has **two separate sets of labels**:

- `metadata.labels` — the Deployment object's own labels. Other resources (such as label selectors, GitOps controllers, or monitoring dashboards) use these to find the Deployment.
- `spec.template.metadata.labels` — the labels applied to **every Pod** the Deployment creates.

These two sets are independent. Adding a label to the Deployment does not add it to its Pods, and vice versa. Confusing them is a common source of subtle bugs where the Deployment looks correct but the Pods have the wrong tags.

## Situation

The `frontend` Deployment in `fl-k8s-0020` was created with `env=staging` on the Deployment itself, but the Pod template is missing that label. The environment-aware routing system expects every Pod to carry `env=staging`.

## Task

Inspect the `frontend` Deployment's full YAML:

```
kubectl get deployment frontend -n fl-k8s-0020 -o yaml
```

Compare `metadata.labels` with `spec.template.metadata.labels`. Add `env: staging` to the **Pod template** so that every Pod created by this Deployment carries the label. Verify the rollout completes.

Official documentation: [Labels and Selectors](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/)
