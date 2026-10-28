The `app` Deployment in `fl-k8s-0035` is running, but it is missing a required configuration
value. The application expects the environment variable `APP_ENV` to be present in its container
spec, set to `production`. Without it, the app would fall back to an unintended mode.

Environment variables are how containers receive configuration at startup. You can inject them
directly as a literal `value` — no external object needed. This is the simplest form and the
right choice for non-sensitive, non-shared values. The spec field lives at
`spec.template.spec.containers[].env[]` inside the Deployment.

Update the Deployment so container `app` has `APP_ENV=production`. Use
**`kubectl set env deployment/app APP_ENV=production -n fl-k8s-0035`** for a quick imperative
change, or **`kubectl edit deployment app -n fl-k8s-0035`** to edit the manifest in place. After
saving, confirm the rollout finishes with **`kubectl rollout status deployment/app -n fl-k8s-0035`**.
