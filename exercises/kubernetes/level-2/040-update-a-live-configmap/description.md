Namespace `fl-k8s-0040` has a ConfigMap `runtime-config` with `FEATURE_FLAG=disabled`, and a
Deployment `app` that loads all its keys via `envFrom`. Your task is to change `FEATURE_FLAG`
to `enabled` in the ConfigMap, then restart the Deployment so its pods see the new value.

Updating a ConfigMap does not automatically refresh environment variables in running pods.
Environment variables are snapshot at pod start — they are read once from the ConfigMap and
baked into the container's process. Mounted files do eventually update in place, but env vars
sourced via `env[]` or `envFrom` do not. The only way to propagate a ConfigMap change to env
vars is to restart the pods.

Edit the ConfigMap with **`kubectl edit configmap runtime-config -n fl-k8s-0040`** and change
`FEATURE_FLAG` to `enabled`. Then trigger a restart:
**`kubectl rollout restart deployment/app -n fl-k8s-0040`**. This writes a restart annotation
to the Pod template, causing a rolling update without any spec change. Confirm the rollout with
**`kubectl rollout status deployment/app -n fl-k8s-0040`**.
