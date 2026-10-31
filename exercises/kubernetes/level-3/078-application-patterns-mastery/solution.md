**Step 1: Fix the Deployment init container image**

```bash
kubectl patch deployment api -n fl-k8s-0078 --type=json \
  -p='[{"op":"replace","path":"/spec/template/spec/initContainers/0/image","value":"busybox:1.36"}]'

kubectl rollout status deployment/api -n fl-k8s-0078
```

**Step 2: Create the data-fix Job**

```bash
kubectl create job data-fix \
  --image=busybox:1.36 \
  -n fl-k8s-0078 \
  -- sh -c 'echo "data fixed"'

kubectl wait --for=condition=complete job/data-fix -n fl-k8s-0078 --timeout=120s
```

**Step 3: Fix the CronJob schedule**

```bash
kubectl patch cronjob archiver -n fl-k8s-0078 \
  --type=merge \
  -p='{"spec":{"schedule":"0 0 * * 0"}}'
```

**Step 4: Fix the DaemonSet image**

```bash
kubectl set image daemonset/metrics collector=busybox:1.36 -n fl-k8s-0078

kubectl rollout status daemonset/metrics -n fl-k8s-0078 --timeout=120s
```

**Verify all checks**

```bash
kubectl get deployment api -n fl-k8s-0078
kubectl get job data-fix -n fl-k8s-0078
kubectl get cronjob archiver -n fl-k8s-0078
kubectl get daemonset metrics -n fl-k8s-0078
```
