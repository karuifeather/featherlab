Namespace `fl-k8s-0037` already has a ConfigMap `app-config` with keys `APP_ENV=production`
and `LOG_LEVEL=info`, and a Deployment `app` that is running but does not yet read from it.
Your task is to update the Deployment so container `app` receives the environment variable
`APP_ENV` sourced from `app-config`'s key `APP_ENV`.

Sourcing an env var from a ConfigMap key links the container's environment to a named ConfigMap
object. When the ConfigMap changes, you can update the pod without changing the Deployment spec
itself. The `configMapKeyRef` field on an `env[]` entry does this: it names the ConfigMap and
the key to read.

Use **`kubectl set env deployment/app --from=configmap/app-config --keys=APP_ENV -n fl-k8s-0037`**
to inject the key with a single command — this writes a proper `configMapKeyRef` entry.
Alternatively, use **`kubectl edit deployment app -n fl-k8s-0037`** and add the `env` block by
hand. After the change, confirm with **`kubectl rollout status deployment/app -n fl-k8s-0037`**.
