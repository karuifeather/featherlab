Namespace `fl-k8s-0038` has a ConfigMap `settings` with keys `HOST=db.default` and
`PORT=5432`, and a Deployment `app` that does not yet load them. Your task is to update the
Deployment so container `app` loads every key from `settings` at once using `envFrom`.

The `envFrom` field is an alternative to listing individual `env[]` entries. Rather than
picking specific keys, `envFrom.configMapRef` loads the entire ConfigMap — every key becomes
an environment variable. This is convenient when a ConfigMap acts as a complete configuration
block for a service.

**Important:** `kubectl set env --from=configmap/settings` does _not_ create `envFrom`. It
writes individual `env[]` entries with `configMapKeyRef`, which is a different mechanism.
To add `envFrom`, use **`kubectl edit deployment app -n fl-k8s-0038`** and add
`envFrom: [{configMapRef: {name: settings}}]` under `spec.template.spec.containers[0]`. Or
use **`kubectl patch`** with a JSON merge patch. After saving, confirm the rollout with
**`kubectl rollout status deployment/app -n fl-k8s-0038`**.
