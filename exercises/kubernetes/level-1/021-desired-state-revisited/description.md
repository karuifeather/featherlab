## Background

When you change `spec.replicas` on a Deployment, Kubernetes reconciles immediately by creating or deleting Pods. But there is an important distinction:

| Change type                           | New ReplicaSet? | New revision? |
| ------------------------------------- | --------------- | ------------- |
| `spec.replicas` (scale)               | No              | No            |
| `spec.template` (image, env, labels…) | Yes             | Yes           |

Scaling adjusts _how many_ Pods run; changing the template changes _what_ runs. Only template changes increment the rollout revision counter you see in `kubectl rollout history`.

## Situation

The `orders` service in `fl-k8s-0021` currently runs 1 replica. The team has decided to run 4 replicas for high availability and wants to record the reason in the Deployment's annotations.

## Task

1. Scale the `orders` Deployment to **4 replicas**.
2. Add the annotation `featherlab.dev/scale-reason=high-availability` to the **Deployment object** (not the Pod template).
3. Verify the rollout completes with all 4 replicas available.

After completing both steps, check `kubectl rollout history deployment/orders -n fl-k8s-0021` — you should see only **one revision**, confirming that scaling alone did not create a new one.

Official documentation: [Scaling a Deployment](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#scaling-a-deployment)
