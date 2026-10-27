A Deployment's replica count is a **desired state**: "keep this many Pods running". Kubernetes
then works to make the **actual state** match, creating Pods when there are too few and removing
them when there are too many. You change the desire; the controller does the work.

In `fl-k8s-0015`, traffic has shifted: the `frontend` needs more capacity and the `worker` needs
less. Scale both, then watch the Pods appear and disappear until desired and actual agree.

Documentation: [scaling a Deployment](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/#scaling-a-deployment)
