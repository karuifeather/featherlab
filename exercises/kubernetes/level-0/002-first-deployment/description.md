So far you have created Pods directly. A bare Pod is gone for good if it is deleted or its node
fails. In practice you rarely create Pods yourself. Instead you describe what you want, for
example "two copies of this container", and a **Deployment** keeps it true:

- the Deployment holds a **Pod template** (what each Pod looks like) and a **replica count**;
- it creates a **ReplicaSet** for that template, and the ReplicaSet creates and replaces the Pods;
- when the template changes, the Deployment rolls out a new ReplicaSet and retires the old one.

Create a Deployment named `api` in the `fl-k8s-0002` namespace. Then look at what Kubernetes made
from it: `kubectl get deployments,replicasets,pods -n fl-k8s-0002`. Notice how the Pod names
start with the ReplicaSet's name, which starts with the Deployment's.

Labels can be set on the Deployment object itself and, separately, on the Pods it creates. This
exercise asks for a label on the **Deployment**.

Any approach is fine: imperative commands, or a manifest you write and apply (with
`metadata.namespace: fl-k8s-0002`). FeatherLab grades the resulting Kubernetes resources.

Documentation: [Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/)
