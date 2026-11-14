A Pod is the smallest thing Kubernetes runs: one or more containers scheduled together. Use the
terminal to run a single nginx Pod and confirm that Kubernetes reports it healthy.

**Every exercise has its own namespace.** This one works in `fl-k8s-0001`, which has been
created for you. kubectl uses the `default` namespace unless you say otherwise, so either:

- pass `-n fl-k8s-0001` to each command, or
- set `metadata.namespace: fl-k8s-0001` in any manifest you write and `kubectl apply`, or
- run `kubectl config set-context --current --namespace=fl-k8s-0001` once, which makes
  `fl-k8s-0001` the namespace kubectl uses when you pass nothing.

That last setting stays until you change it, so run it again with the new namespace when you
move to another exercise. Resources created in another namespace are not graded.

There is no single required command. FeatherLab grades the resulting Kubernetes resources, not
the keystrokes you used.
