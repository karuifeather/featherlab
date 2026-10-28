The `db-credentials` Secret is missing from the `fl-k8s-0041` namespace. A downstream service
needs it before it can start, so this is your first task to fix.

Create an `Opaque` Secret named `db-credentials` in `fl-k8s-0041` with two keys:
`username` set to `dbuser` and `password` set to `s3cr3t`.

**Important:** Kubernetes stores Secret values as base64-encoded strings in its API. Base64 is an
encoding scheme for binary safety — it is not encryption. Anyone with `get` access to the Secret
can decode the values with `base64 -d`. For real workloads, restrict access with RBAC and enable
Secrets encryption at rest on the API server.
