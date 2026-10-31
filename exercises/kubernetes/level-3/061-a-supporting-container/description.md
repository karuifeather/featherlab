Kubernetes 1.29 introduced **native sidecars**: init containers that start before the main
container and run for the entire life of the Pod. The key difference from a traditional init
container is one field: `restartPolicy: Always`.

**Where the sidecar lives**

A native sidecar is declared in `spec.template.spec.initContainers[]`, just like a regular init
container. Adding `restartPolicy: Always` is what changes its behaviour — instead of running once
and exiting, it starts alongside the main container and restarts if it crashes.

```yaml
initContainers:
  - name: logger
    image: busybox:1.36
    restartPolicy: Always # ← makes this a native sidecar
    command: ["sh", "-c", "while true; do echo logging; sleep 5; done"]
```

**Why not containers[]?**

You learned about sidecars in Level 2, where the helper container lived in `containers[]`. That
approach works but has ordering and lifecycle problems: `containers[]` entries start in any order
and Kubernetes does not distinguish them from the main app. Native sidecars fix this — the
sidecar starts first and stays running, just like a proper helper should.

**What you will do**

Create a Deployment named `app` in `fl-k8s-0061`:

- Main container `app` using `nginx:1.27`
- Native sidecar `logger` using `busybox:1.36` in `initContainers[]` with `restartPolicy: Always`
