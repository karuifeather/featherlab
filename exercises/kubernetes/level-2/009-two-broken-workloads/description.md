Two teams share `fl-k8s-0009`, and both are paging you:

- **orders**: "Our Pods are up, but nothing reaches them through the `orders` Service."
- **payments**: "Our new release never started. The settings are in the `payments-config`
  ConfigMap, like always."

The two problems are unrelated. Fixing one will not fix the other, and the exercise passes
only when both workloads are healthy. Diagnose each from what the cluster reports, and fix it
at its source without breaking what already works.
