Init containers often prepare files for the main container: rendering a config template, cloning
a repository, or writing a seed file. To pass data between them, both containers must mount the
same volume.

**emptyDir volumes**

An `emptyDir` volume is created fresh when the Pod starts and deleted when the Pod is removed.
It lives only for the Pod's lifetime — it is not persistent storage. But it is perfect for
sharing temporary data between init containers and the main container.

The volume must be declared at the pod level (`spec.volumes[]`), and each container that needs
it must add a `volumeMount` pointing to the same volume name.

**What you will do**

Create a Deployment named `app` in `fl-k8s-0058` with:

- Volume `shared-data` (emptyDir)
- Init container `writer` (`busybox:1.36`) that writes `hello from init` to `/shared/index.html`
- Main container `app` (`nginx:1.27`) that mounts `shared-data` at `/usr/share/nginx/html`

```bash
kubectl apply -f - <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app
  namespace: fl-k8s-0058
spec:
  replicas: 1
  selector:
    matchLabels: { app: app }
  template:
    metadata:
      labels: { app: app }
    spec:
      volumes:
        - name: shared-data
          emptyDir: {}
      initContainers:
        - name: writer
          image: busybox:1.36
          command: ["sh", "-c", "echo 'hello from init' > /shared/index.html"]
          volumeMounts:
            - name: shared-data
              mountPath: /shared
      containers:
        - name: app
          image: nginx:1.27
          volumeMounts:
            - name: shared-data
              mountPath: /usr/share/nginx/html
EOF
```
