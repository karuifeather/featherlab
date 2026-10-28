Before you change anything in Kubernetes, you look at it. Three commands answer most questions:

| Command                               | Shows                                                                |
| ------------------------------------- | -------------------------------------------------------------------- |
| `kubectl get pods -n <ns>`            | a one-line summary per Pod: ready containers, status, restarts, age  |
| `kubectl describe pod <name> -n <ns>` | one Pod in detail: labels, image, node, conditions and recent events |
| `kubectl logs <name> -n <ns>`         | what the container printed (its standard output)                     |

Namespace `fl-k8s-0011` has two Pods, `alpha` and `bravo`. They run the same image and look the
same in `kubectl get`. One of them reported in its log that it needs review. Find it and mark it
with a **label**, a `key=value` pair stored in the Pod's metadata.

Labels can be added to a running Pod without restarting it. Leave the other Pod unlabelled, and
keep both running.

Documentation: [Pods](https://kubernetes.io/docs/concepts/workloads/pods/),
[labels](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/),
[kubectl quick reference](https://kubernetes.io/docs/reference/kubectl/quick-reference/)
