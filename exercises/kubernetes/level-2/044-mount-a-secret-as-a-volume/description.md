The `api` Deployment in `fl-k8s-0044` needs to read key files from a Secret. A Secret named
`api-keys` already exists in the namespace with keys `primary.key` and `backup.key`, but
the container does not yet mount it.

Mount Secret `api-keys` into container `api` as a volume. Any mount path under `/etc/secrets/`
is acceptable.

**How Secret volume mounts work:** When Kubernetes mounts a Secret as a volume, each key in
`Secret.data` becomes a file at `<mountPath>/<key-name>`. For example, mounting `api-keys`
at `/etc/secrets/api-keys` would produce:

```
/etc/secrets/api-keys/primary.key
/etc/secrets/api-keys/backup.key
```

This is useful when an application reads credentials from files rather than environment
variables — for example, TLS certificates, SSH keys, or configuration files that contain
sensitive values.

**Volume mounts vs env vars:** Mounting as a volume is preferred over env vars for credentials
that rotate, because Kubernetes updates the mounted files when the Secret changes (within a
kubelet sync period). Environment variables are fixed at container start time and require a
Pod restart to pick up new values.
