`kubectl run` is handy, but most Kubernetes work is **declarative**: you write down the object you
want in a YAML **manifest**, and `kubectl apply` makes the cluster match it. The same file can be
reviewed, stored in git and applied again later.

Every manifest has four parts:

```yaml
apiVersion: v1 # which API group/version defines this kind
kind: Pod # what sort of object
metadata: # identity: name, namespace, labels
  name: ____
  namespace: ____
  labels:
    ____: ____
spec: # the desired state; its fields depend on the kind
  containers:
    - name: ____
      image: ____
```

Write a manifest for the Pod described in the requirements and apply it. Some of the
requirements (the container's name, several labels) are awkward to express with `kubectl run`
alone, which is exactly what manifests are for.

Tip: `kubectl run notes --image=nginx:1.27 --dry-run=client -o yaml` prints a manifest without
creating anything, a quick way to start a file you then edit.

Documentation: [objects in Kubernetes](https://kubernetes.io/docs/concepts/overview/working-with-objects/),
[declarative management](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/declarative-config/)
