# Solution

Create a manifest for the headless Service (you cannot set `clusterIP: None` with `kubectl expose`):

```yaml
# db-headless.yaml
apiVersion: v1
kind: Service
metadata:
  name: db-headless
  namespace: fl-k8s-0112
spec:
  clusterIP: None
  selector:
    app: db
  ports:
    - port: 80
      targetPort: 80
```

Apply it:

```bash
kubectl apply -f db-headless.yaml
```

Verify the Service shows `None` for ClusterIP:

```bash
kubectl get svc db-headless -n fl-k8s-0112
```

Test DNS resolution — you should see multiple A records (one per ready Pod):

```bash
kubectl run tmp --restart=Never --rm -it --image=busybox:1.36 -n fl-k8s-0112 -- \
  nslookup db-headless
```
