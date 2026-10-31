Deployment `beacon` is already running in namespace `fl-k8s-0087`, but it has no `nodeSelector` configured.

Every Pod runs on exactly one node. The scheduler assigns Pods to nodes based on available resources and constraints. You can restrict which nodes a Pod can run on using `nodeSelector` — the scheduler only considers nodes whose labels include every key-value pair in the selector.

Your task:

- Add a nodeSelector `kubernetes.io/os: linux` to the Pod template of Deployment `beacon` in namespace `fl-k8s-0087`
- The Deployment must finish rolling out with 1 available replica
