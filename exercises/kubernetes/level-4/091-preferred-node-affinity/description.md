`preferredDuringSchedulingIgnoredDuringExecution` provides a **soft** scheduling preference. Kubernetes tries to honor it, but still schedules the pod even if no matching node exists. This is safer than required affinity when the cluster doesn't guarantee specific labels.

Preferred rules take a `weight` (1–100). When multiple nodes are candidates, Kubernetes scores them: nodes matching a preference get a higher score, and the scheduler picks the highest-scoring node.

Your task:

Create a Deployment named `worker` in namespace `fl-k8s-0091`:

- 2 replicas, container `app` using `nginx:1.27`
- Resource requests: cpu=`50m`, memory=`32Mi`
- Preferred node affinity rule: `kubernetes.io/arch In [amd64]` with weight 10
- The Deployment must finish rolling out
