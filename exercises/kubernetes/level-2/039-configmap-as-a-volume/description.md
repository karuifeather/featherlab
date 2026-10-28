Namespace `fl-k8s-0039` has a ConfigMap `nginx-conf` containing a key `nginx.conf` with a
minimal nginx configuration, and a Deployment `app` that does not yet mount it. Your task is
to mount ConfigMap `nginx-conf` into container `app` as a volume.

Mounting a ConfigMap as a volume makes each ConfigMap key appear as a file inside the
container. This is the right approach for configuration files that an application reads from
disk — as opposed to environment variables, which only work for single values. When the
ConfigMap is updated, the mounted files eventually refresh without restarting the pod.

Mounting onto a path that nginx auto-loads (like `/etc/nginx/conf.d/`) will hide the
directory's existing contents and may cause nginx to fail. Mount at a neutral path such as
`/etc/nginx/custom` to keep things safe. To add the volume, use
**`kubectl edit deployment app -n fl-k8s-0039`**: add a `volumes` entry referencing
`nginx-conf` under `spec.template.spec`, and add a matching `volumeMounts` entry on the
container. Confirm the rollout with **`kubectl rollout status deployment/app -n fl-k8s-0039`**.
