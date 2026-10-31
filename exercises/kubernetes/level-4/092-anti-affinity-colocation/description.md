Pod anti-affinity spreads replicas away from each other. A common production pattern pairs pod anti-affinity with `topologyKey: kubernetes.io/hostname` so that no two replicas of the same Deployment land on the same node — improving availability if a node fails.

There are two scheduling modes:

- `requiredDuringSchedulingIgnoredDuringExecution`: the second replica **must** go to a different host. On a single-node cluster this leaves the second pod Pending indefinitely.
- `preferredDuringSchedulingIgnoredDuringExecution`: Kubernetes **tries** to spread replicas, but falls back to the same node when no alternative exists.

This cluster has only one node, so you must use **preferred** pod anti-affinity.

Your task:

Create a Deployment named `spread` in namespace `fl-k8s-0092`:

- 2 replicas, container `app` using `nginx:1.27`
- Resource requests: cpu=`50m`, memory=`32Mi`
- Required node affinity: `kubernetes.io/os In [linux]`
- Preferred pod anti-affinity (weight 100, topologyKey: `kubernetes.io/hostname`, label selector: `app: spread`)
- The Deployment must finish rolling out with 2 replicas
