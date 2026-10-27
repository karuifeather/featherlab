inventory-api has two faults. The image tag `nginx:1.27-alpne` does not exist
(ImagePullBackOff). After that is fixed, the Pods run but stay `0/1`: the readiness probe names
port `web` and the container only defines `http` (`port "web" not found` in Events).

```bash
NS=fl-k8s-0010
kubectl set image deployment/inventory-api api=nginx:1.27 -n $NS
kubectl patch deployment inventory-api -n $NS --type=json \
  -p='[{"op":"replace","path":"/spec/template/spec/containers/0/readinessProbe/httpGet/port","value":"http"}]'
kubectl scale deployment inventory-api --replicas=3 -n $NS
kubectl rollout status deployment/inventory-api -n $NS

kubectl create deployment inventory-worker --image=nginx:1.27 -n $NS --dry-run=client -o yaml > worker.yaml
# rename the container to "worker" and add:
#   resources: { requests: { cpu: 50m, memory: 32Mi }, limits: { memory: 64Mi } }
kubectl apply -f worker.yaml
kubectl rollout status deployment/inventory-worker -n $NS

kubectl scale deployment inventory-api --replicas=0 -n fl-k8s-0010-legacy
```
