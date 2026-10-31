No Deployment exists yet in namespace `fl-k8s-0088`.

A `nodeSelector` ensures Pods only run on nodes with matching labels. If no matching node exists, the Pods remain `Pending` and are never scheduled.

Your task: Create a Deployment named `scanner` in namespace `fl-k8s-0088` with:

- 2 replicas
- Container named `app`, image `nginx:1.27`
- Resource requests: cpu `50m`, memory `32Mi`
- nodeSelector: `kubernetes.io/arch: amd64`

The Deployment must finish rolling out with 2 available replicas.

Note: the kind cluster node has the label `kubernetes.io/arch=amd64`, so this selector will match and pods will schedule.
