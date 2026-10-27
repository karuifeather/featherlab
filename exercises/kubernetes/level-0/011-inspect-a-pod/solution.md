```bash
kubectl logs alpha -n fl-k8s-0011   # status: ok
kubectl logs bravo -n fl-k8s-0011   # status: needs-review
kubectl label pod bravo review=needed -n fl-k8s-0011
kubectl get pods -n fl-k8s-0011 --show-labels
```
