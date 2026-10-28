# Reference Solution

```bash
# List all revisions
kubectl rollout history deployment/catalog-api -n fl-k8s-0031

# Inspect each revision to find images
kubectl rollout history deployment/catalog-api -n fl-k8s-0031 --revision=1
kubectl rollout history deployment/catalog-api -n fl-k8s-0031 --revision=2
kubectl rollout history deployment/catalog-api -n fl-k8s-0031 --revision=3

# Revision 2 has nginx:1.27-alpine — restore it
kubectl rollout undo deployment/catalog-api -n fl-k8s-0031 --to-revision=2

kubectl rollout status deployment/catalog-api -n fl-k8s-0031
```
