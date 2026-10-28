Labels are how Kubernetes finds things. A label is a `key=value` pair in an object's metadata,
and a **selector** is a query over labels: `app=cart` matches every object labelled `app=cart`,
and `app=cart,env=prod` matches only those that carry both. Deployments find their Pods this way,
and Services find the Pods to send traffic to. Later exercises rely on it.

The Pods in `fl-k8s-0014` are being promoted from development to production. Update their labels
so that selectors pick out the right Pods, and add a third cart Pod with production labels from
the start.

You will need to change a label that already has a value, remove a label, and create a Pod with
labels.

Documentation: [labels and selectors](https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/)
