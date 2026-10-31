Node affinity is a more expressive alternative to `nodeSelector`. While `nodeSelector` restricts scheduling with exact key=value label matches, node affinity supports operators like `In`, `NotIn`, `Exists`, `DoesNotExist`, `Gt`, and `Lt`, and provides two scheduling modes: required and preferred.

`requiredDuringSchedulingIgnoredDuringExecution` is the **required** mode: pods are only scheduled on nodes that match the affinity rule. If no matching node exists, the pod stays Pending. The `IgnoredDuringExecution` suffix means that if a node's labels change after the pod is scheduled, the pod is not evicted.

Your task:

Create a Deployment named `cache` in namespace `fl-k8s-0090`:

- 1 replica, container `app` using `nginx:1.27`
- Resource requests: cpu=`50m`, memory=`32Mi`
- Required node affinity rule: `kubernetes.io/os In [linux]`
- The Deployment must finish rolling out
