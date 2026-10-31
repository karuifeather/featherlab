```bash
# Diagnose: see FailedScheduling event
kubectl describe pods -n fl-k8s-0093

# Fix: patch the nodeAffinity rule to use kubernetes.io/os=linux
kubectl patch deployment blocked-app -n fl-k8s-0093 --type=json -p='[
  {
    "op": "replace",
    "path": "/spec/template/spec/affinity/nodeAffinity/requiredDuringSchedulingIgnoredDuringExecution/nodeSelectorTerms/0/matchExpressions/0",
    "value": {
      "key": "kubernetes.io/os",
      "operator": "In",
      "values": ["linux"]
    }
  }
]'

# Confirm rollout
kubectl rollout status deployment/blocked-app -n fl-k8s-0093 --timeout=120s
```
