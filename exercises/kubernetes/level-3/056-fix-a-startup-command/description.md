A Pod named `worker` in `fl-k8s-0056` was deployed with a typo in its command. The container
exits immediately with an error, leaving the Pod in phase `Failed`.

**Diagnosing the failure**

```bash
kubectl get pod worker -n fl-k8s-0056
# STATUS column shows Error or OOMKilled instead of Completed

kubectl logs worker -n fl-k8s-0056
# Shows the error message from the bad command

kubectl describe pod worker -n fl-k8s-0056
# Shows exit code and reason under "Last State"
```

**Pod specs are immutable**

You cannot edit a Pod's command in place. Once a Pod is created, its container spec is frozen.
To fix it you must:

1. Delete the existing Pod.
2. Create a new Pod with the corrected command.

```bash
kubectl delete pod worker -n fl-k8s-0056
```

Then recreate it with the correct command (`echo 'hello'`, not the typo):

```bash
kubectl run worker \
  --image=busybox:1.36 \
  --restart=Never \
  -n fl-k8s-0056 \
  --command -- echo 'hello'
```

Wait for it to succeed:

```bash
kubectl wait pod/worker -n fl-k8s-0056 \
  --for=jsonpath={.status.phase}=Succeeded \
  --timeout=60s
```
