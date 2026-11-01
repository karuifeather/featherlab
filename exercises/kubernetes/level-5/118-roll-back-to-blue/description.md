# Roll Back to Blue

## Why rollback is a first-class operation

A traffic switch is reversible for exactly the reason blue/green is valuable: the previous
version is still running. Rolling back is identical to switching — you change the Service
selector again. There is no redeployment, no image pull, no Pod restart.

## The current state

The Service `web` was switched to green (simulating a recent release). Traffic is now
going to `web-green`.

```bash
kubectl get svc web -n fl-k8s-0118 -o jsonpath='{.spec.selector}'
# {"app":"web","version":"green"}
```

`web-blue` is running at 3 replicas but receives no traffic.

## The task

Roll back by switching the Service selector from `version=green` back to `version=blue`.
The `web-blue` Deployment must have at least 3 ready endpoints after the rollback.

Do not delete or scale down either Deployment — preserve both so you can re-examine
what went wrong with green.

## Reference

- [Services — updating a service](https://kubernetes.io/docs/concepts/services-networking/service/#updating-a-service)
