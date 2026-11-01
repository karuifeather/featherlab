# Headless Service

## Normal vs headless Services

A normal ClusterIP Service gives all traffic a single **virtual IP** (VIP). kube-proxy rules
on each node translate that VIP to a real Pod IP, load-balancing across all ready backends.

A **headless** Service sets `clusterIP: None`. There is no VIP. Instead, CoreDNS returns
**one A record per ready Pod IP**. Clients receive the full list and connect directly.

```
Normal:   nslookup api  → 10.96.0.42  (single ClusterIP)
Headless: nslookup db-headless → 10.244.0.5, 10.244.0.6  (one per Pod)
```

## When to use headless Services

- **StatefulSets**: each Pod needs a stable, individual DNS name (`pod-0.db-headless`).
- **Direct Pod addressing**: clients want to choose which replica to call (e.g., read replica
  selection in distributed databases).
- **Service mesh discovery**: sidecars that enumerate endpoints need the raw IP list.

## Creating a headless Service

`kubectl expose` does not support `clusterIP: None`. Use a manifest:

```yaml
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

## The task

Namespace `fl-k8s-0112` has a `db` Deployment with 2 replicas. Create a headless Service
named `db-headless` that:

- Has `clusterIP: None`
- Selects Pods with label `app=db`
- Exposes port `80`

Verify with:

```bash
kubectl run tmp --restart=Never --rm -it --image=busybox:1.36 -n fl-k8s-0112 -- \
  nslookup db-headless
```

With 2 ready replicas you should see two A records in the response.

## Reference

- [Headless Services](https://kubernetes.io/docs/concepts/services-networking/service/#headless-services)
- [StatefulSet stable network IDs](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/#stable-network-id)
