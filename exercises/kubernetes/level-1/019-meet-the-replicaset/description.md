## Background

A **Deployment** does not manage Pods directly. Instead it creates and updates a **ReplicaSet**, which in turn creates the Pods. When you change a Deployment's Pod template — its `spec.template` — Kubernetes creates a _new_ ReplicaSet with the updated template and gradually shifts traffic to it while scaling down the old one.

Understanding this three-level hierarchy helps you debug rollouts, trace which Pods belong to which revision, and see why template changes require a new rollout while scaling does not.

| Object     | Purpose                                                         |
| ---------- | --------------------------------------------------------------- |
| Deployment | Owns the desired state; manages rollout strategy                |
| ReplicaSet | Ensures `N` identical Pods with a specific template are running |
| Pod        | The actual running container(s)                                 |

## Situation

The `catalog` service is running in `fl-k8s-0019` with 2 replicas, but its Pod template is missing the `tier=backend` label. The observability platform uses this label to route metrics correctly.

## Task

Inspect the `catalog` Deployment and its ReplicaSet using `kubectl get replicasets -n fl-k8s-0019` and `kubectl describe deployment catalog -n fl-k8s-0019`. Then add the label `tier=backend` to the **Pod template** (under `spec.template.metadata.labels`), not to the Deployment's own metadata. Verify the rollout completes.

To inspect a running Deployment's full YAML:

```
kubectl get deployment catalog -n fl-k8s-0019 -o yaml
```

Official documentation: [Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/), [ReplicaSets](https://kubernetes.io/docs/concepts/workloads/controllers/replicaset/)
