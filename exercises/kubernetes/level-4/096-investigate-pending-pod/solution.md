Diagnose the pending pod:

```bash
kubectl describe pods -n fl-k8s-0096
# Events: ... 0/1 nodes are available: 1 Insufficient cpu.
```

Check the node's allocatable CPU:

```bash
kubectl describe node | grep -A5 Allocatable
```

Fix the CPU request and limit:

```bash
kubectl set resources deployment greedy-app -c app \
  --requests=cpu=200m,memory=64Mi \
  --limits=cpu=500m,memory=128Mi \
  -n fl-k8s-0096
```

Verify the rollout:

```bash
kubectl rollout status deployment/greedy-app -n fl-k8s-0096 --timeout=120s
kubectl get pods -n fl-k8s-0096
```
