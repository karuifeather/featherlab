```bash
NS=fl-k8s-0014
kubectl label pod cart-a cart-b search-a env=prod --overwrite -n $NS
kubectl label pod search-a debug- -n $NS
kubectl run cart-c --image=nginx:1.27 --labels=app=cart,env=prod -n $NS
kubectl get pods -n $NS -l app=cart,env=prod
```

Common mistakes: `kubectl label ... env=prod` without `--overwrite` fails with
"already has a value"; labelling `search-a` as `app=cart` makes the selector return four Pods.
