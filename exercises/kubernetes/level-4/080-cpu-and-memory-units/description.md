Kubernetes lets you specify resource requests (what the container needs for scheduling) and limits (the maximum it can use) independently for both CPU and memory.

Your task:

- Create a Deployment named `logger` in namespace `fl-k8s-0080` with 1 replica
- Container name: `main`, image: `busybox:1.36`, command: `["sh", "-c", "sleep 3600"]`
- CPU request: `200m`, CPU limit: `500m`
- Memory request: `128Mi`, memory limit: `256Mi`
- The Deployment must finish rolling out with 1 available replica

Reference: `kubectl explain deployment.spec.template.spec.containers.resources`
