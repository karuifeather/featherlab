A common mistake is placing a supporting container in `containers[]` alongside the main app
instead of in `initContainers[]` as a native sidecar. Both approaches compile, but only the
`initContainers[]` placement gives you the ordering and lifecycle guarantees native sidecars
were designed to provide.

**What goes wrong**

When `helper` is in `containers[]`, it is a peer to the main container with no guaranteed start
order. It also counts toward the Pod's READY count, making the deployment appear to have more
replicas than you intend. Most importantly, the grading check `k8s.init-container` looks in
`initContainers[]`, so it will fail even if the deployment is otherwise healthy.

**How to fix it**

You need to:

1. Remove `helper` from `containers[]`
2. Add it to `initContainers[]`
3. Add `restartPolicy: Always` to make it a native sidecar

The cleanest approach is to export the Deployment manifest, edit it, and re-apply:

```bash
kubectl get deployment web-app -n fl-k8s-0063 -o yaml > web-app.yaml
# edit: move helper from containers[] to initContainers[], add restartPolicy: Always
kubectl apply -f web-app.yaml
```

**What you will do**

Inspect the existing Deployment `web-app` in `fl-k8s-0063`. Move the `helper` container from
`containers[]` to `initContainers[]` with `restartPolicy: Always` and trigger a new rollout.
