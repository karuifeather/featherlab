Open the Deployment in your editor:

```bash
kubectl edit deployment web -n fl-k8s-0047
```

Find `spec.template.spec.containers` and add a second entry:

```yaml
- name: metrics-exporter
  image: busybox:1.36
  command: ["sh", "-c", 'while true; do echo "$(date): metrics ok"; sleep 10; done']
```

Save and exit. Kubernetes triggers a rolling update. Watch it complete:

```bash
kubectl rollout status deployment/web -n fl-k8s-0047
```

Verify both containers are present:

```bash
kubectl get deployment web -n fl-k8s-0047 \
  -o jsonpath='{.spec.template.spec.containers[*].name}'
```
