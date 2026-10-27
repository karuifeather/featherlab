Diagnosis: the Pods are in `ErrImagePull` / `ImagePullBackOff`. `kubectl describe pod` shows
`failed to resolve reference "docker.io/library/nginx:1.27.99": not found`. The tag does not
exist.

```bash
kubectl set image deployment/storefront web=nginx:1.27 -n fl-k8s-0004
kubectl rollout status deployment/storefront -n fl-k8s-0004
```

`kubectl edit deployment storefront -n fl-k8s-0004` (change the image) works equally well.
