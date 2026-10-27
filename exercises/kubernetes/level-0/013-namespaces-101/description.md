A **namespace** is a named group of objects inside one cluster. Teams and environments use them
to keep their objects apart. Most kinds you have met (Pods, Deployments, Services) are
namespaced, and two important rules follow:

- a name must be unique **within** a namespace, but the same name can exist in another one;
- every kubectl command acts in exactly one namespace: the one you pass with `-n`, or
  `default` if you pass nothing. `-A` (`--all-namespaces`) is for looking across all of them.

This exercise has two namespaces. `fl-k8s-0013-sandbox` already holds a `web` Pod and a leftover
`scratch` Pod. Give `fl-k8s-0013` its own `web` Pod, keep the sandbox's `web` running, and clean
up `scratch`.

In a manifest, the namespace goes in `metadata.namespace`.

Documentation: [namespaces](https://kubernetes.io/docs/concepts/overview/working-with-objects/namespaces/)
