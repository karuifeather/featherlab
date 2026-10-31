This is a mastery exercise. No starter resources are provided — build the entire Deployment from scratch.

Create a Deployment named `api-gateway` in namespace `fl-k8s-0097` that combines everything you have learned about resource budgets and scheduling placement:

| Field                   | Value                           |
| ----------------------- | ------------------------------- |
| Replicas                | `2`                             |
| Container name          | `gateway`                       |
| Container image         | `nginx:1.27`                    |
| CPU request             | `100m`                          |
| CPU limit               | `300m`                          |
| Memory request          | `64Mi`                          |
| Memory limit            | `128Mi`                         |
| nodeSelector            | `kubernetes.io/os: linux`       |
| nodeAffinity (required) | `kubernetes.io/arch In [amd64]` |

The Deployment must finish rolling out with 2 available replicas.

**Tips:**

- Use `kubectl get node --show-labels` to confirm the node has both labels before applying.
- `kubectl explain deployment.spec.template.spec.affinity.nodeAffinity` shows the full field structure.
- `kubectl explain deployment.spec.template.spec.nodeSelector` is simpler — it is just a key/value map.
