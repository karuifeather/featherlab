Edit the Deployment to add the volume and volumeMount:

```bash
kubectl edit deployment app -n fl-k8s-0039
```

Under `spec.template.spec`, add a `volumes` entry:

```yaml
volumes:
  - name: nginx-config
    configMap:
      name: nginx-conf
```

Under `spec.template.spec.containers[0]`, add a `volumeMounts` entry:

```yaml
volumeMounts:
  - name: nginx-config
    mountPath: /etc/nginx/custom
```

Save and exit. Confirm the rollout:

```bash
kubectl rollout status deployment/app -n fl-k8s-0039
```

Verify the mount is present:

```bash
kubectl get deployment app -n fl-k8s-0039 \
  -o jsonpath='{.spec.template.spec.containers[0].volumeMounts}'
```
