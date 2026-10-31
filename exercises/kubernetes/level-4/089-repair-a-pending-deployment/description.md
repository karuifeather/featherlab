Deployment `stuck-app` is running in namespace `fl-k8s-0089`, but its pods are stuck in `Pending`. The Deployment has a `nodeSelector` that requires a Windows node — and there are no Windows nodes in this cluster.

Your task: Diagnose the scheduling failure, then fix the `nodeSelector` so pods can run.

Steps:

1. Check why pods are Pending: `kubectl describe pods -n fl-k8s-0089` — look for a `FailedScheduling` event.
2. Inspect the Deployment's nodeSelector: `kubectl get deployment stuck-app -n fl-k8s-0089 -o yaml | grep -A5 nodeSelector`
3. Fix the nodeSelector to use `kubernetes.io/os: linux` so the pods schedule on the Linux node.
4. Verify the Deployment finishes rolling out with 1 available replica.
