```bash
NS=fl-k8s-0018
kubectl scale deployment shop --replicas=3 -n $NS
kubectl label deployment shop env=prod --overwrite -n $NS
kubectl logs batch-1 -n $NS   # owner: search team
kubectl logs batch-2 -n $NS   # owner: payments team
kubectl label pod batch-2 team=payments -n $NS

kubectl run status --image=nginx:1.27 --labels=app=status -n $NS-tools --dry-run=client -o yaml > status.yaml
# rename the container from "status" to "probe", then:
kubectl apply -f status.yaml
kubectl rollout status deployment/shop -n $NS
```
