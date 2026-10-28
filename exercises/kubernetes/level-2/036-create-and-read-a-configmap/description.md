The namespace `fl-k8s-0036` is empty. Your task is to create a ConfigMap named `app-config`
that holds two configuration keys: `APP_ENV=production` and `LOG_LEVEL=info`. No Deployment
is involved yet — the focus is on the ConfigMap object itself.

A ConfigMap is a Kubernetes object that stores non-sensitive configuration as key-value pairs.
Decoupling configuration from container images lets you change settings without rebuilding
anything. Applications read these values as environment variables or as mounted files.

Create the ConfigMap with **`kubectl create configmap`** using `--from-literal` flags for each
key. Once created, inspect it with **`kubectl get configmap app-config -n fl-k8s-0036 -o yaml`**
to confirm both keys and values are present. The `describe` subcommand also works:
**`kubectl describe configmap app-config -n fl-k8s-0036`**.
