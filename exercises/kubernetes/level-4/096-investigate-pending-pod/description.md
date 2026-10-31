A Deployment named `greedy-app` was deployed in namespace `fl-k8s-0096`. Its pod is stuck in `Pending` state and never becomes `Running`.

The Kubernetes scheduler only places a pod on a node when the node has enough _allocatable_ CPU and memory to satisfy the pod's _requests_. Run `kubectl describe node` and look at the `Allocatable` section to see what the node can offer.

Your task:

1. Diagnose why the pod is Pending — use `kubectl describe pods -n fl-k8s-0096` and inspect the Events section.
2. Fix Deployment `greedy-app` by setting the correct resource budget on container `app`:

| Field          | Value   |
| -------------- | ------- |
| CPU request    | `200m`  |
| CPU limit      | `500m`  |
| Memory request | `64Mi`  |
| Memory limit   | `128Mi` |

The Deployment must finish rolling out with 1 available replica.
