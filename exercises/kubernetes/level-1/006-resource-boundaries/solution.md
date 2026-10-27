```bash
kubectl set resources deployment ledger -c app -n fl-k8s-0006 \
  --requests=cpu=100m,memory=64Mi --limits=cpu=250m,memory=128Mi
kubectl rollout status deployment/ledger -n fl-k8s-0006
```

Common mistake: omitting `-c app` applies the values to `metrics` as well, which fails the
"metrics keeps its original resources" check.
