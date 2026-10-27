A Pod is the smallest thing Kubernetes runs: one or more containers scheduled together. Use the
terminal to run a single nginx Pod and confirm that Kubernetes reports it healthy.

**Every exercise has its own namespace.** This one works in `fl-k8s-0001`, which has been
created for you. kubectl uses the `default` namespace unless you say otherwise, so either:

- pass `-n fl-k8s-0001` to each command, or
- set `metadata.namespace: fl-k8s-0001` in any manifest you write and `kubectl apply`.

The workstation's kubeconfig is read-only, so `kubectl config set-context --current --namespace=...`
will not work here. Resources created in another namespace are not graded.

There is no single required command. FeatherLab grades the resulting Kubernetes resources, not
the keystrokes you used.
