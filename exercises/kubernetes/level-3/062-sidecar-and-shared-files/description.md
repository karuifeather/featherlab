A native sidecar often needs to share data with the main container. The standard mechanism is an
`emptyDir` volume: a temporary directory that exists for the lifetime of the Pod and is shared
between all containers that mount it.

**Volume + volumeMounts**

Declare the volume at the Pod level under `spec.template.spec.volumes`, then mount it in each
container that needs it:

```yaml
volumes:
  - name: logs
    emptyDir: {}
```

```yaml
initContainers:
  - name: log-collector
    image: busybox:1.36
    restartPolicy: Always
    volumeMounts:
      - name: logs
        mountPath: /collected-logs
containers:
  - name: app
    image: nginx:1.27
    volumeMounts:
      - name: logs
        mountPath: /var/log/app
```

Both containers reference the same volume name (`logs`). Kubernetes mounts the same directory
at each container's specified path, so files written by `log-collector` appear at `/var/log/app`
in the `app` container.

**What you will do**

Create a Deployment named `app` in `fl-k8s-0062`:

- Main container `app`: `nginx:1.27`
- Native sidecar `log-collector`: `busybox:1.36` in `initContainers[]` with `restartPolicy: Always`
- Both containers mount a shared `emptyDir` volume named `logs`
