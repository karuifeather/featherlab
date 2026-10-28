Kubernetes objects are records of intent. When the intent changes, you change the record,
and Kubernetes reconciles. You don't rebuild what already works.

The `reports` Deployment in `fl-k8s-0016` is healthy, but its specification was updated: it
should run two replicas and be marked as owned by the analytics team. Compare the running object
with the requirements, change only what differs, and keep it serving throughout.

Any route is fine: commands from the earlier exercises, editing the live object with
`kubectl edit`, or changing a manifest and applying it again.

Documentation: [managing objects](https://kubernetes.io/docs/concepts/overview/working-with-objects/object-management/)
