Today the inventory service moves to its new namespace, `fl-k8s-0010`. The previous release
still runs in `fl-k8s-0010-legacy`. The launch checklist was half-finished when its owner went
on leave; you have the requirements, not their notes.

Get the new release into shape:

- **inventory-api** was deployed but is not serving. Repair it, run it at launch capacity, and
  keep its health checking in place.
- **inventory-worker** does not exist yet. Create it with the container name and resource
  settings the platform team requires.
- **The legacy release** must stop running, but keep its Deployment so it can be scaled back
  up if the launch goes wrong.

This lab combines the workload skills from Levels 0 to 2: namespaces, Deployments, images,
probes, resources, Services and diagnosis. No step-by-step instructions this time.
