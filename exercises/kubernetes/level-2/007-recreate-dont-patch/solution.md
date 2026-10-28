`kubectl edit pod` fails with `spec: Forbidden: pod updates may not change fields other than
spec.containers[*].image, ...`.

```bash
kubectl get pod audit-log -n fl-k8s-0007 -o yaml > audit-log.yaml
# change the LOG_LEVEL value to "debug" in audit-log.yaml
kubectl replace --force -f audit-log.yaml
kubectl wait --for=condition=Ready pod/audit-log -n fl-k8s-0007 --timeout=120s
```

Common mistake: recreating it with `kubectl run audit-log --image=nginx:1.27 --env=LOG_LEVEL=debug`
drops the `team=platform` label and the named port, so the Service no longer selects it (and
the container is named `audit-log`, not `app`).
