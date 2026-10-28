The `private-app` Deployment in `fl-k8s-0045` is running but has no image pull credentials
configured. In a real environment pulling from a private registry, the kubelet would fail to
pull the image without them.

Your tasks:

1. Create a `docker-registry` Secret named `registry-creds` in `fl-k8s-0045` using fake
   registry credentials (the cluster uses a public registry, so the exact values do not matter).
2. Add `registry-creds` to the Deployment's `spec.template.spec.imagePullSecrets`.

**This exercise creates a credential reference only** — the cluster is configured to use a
public registry. In a production setup with a private registry, the kubelet would use this
Secret for authentication when pulling the image.

**How it works:** `imagePullSecrets` is a list of Secret names on the Pod spec. The kubelet
reads the referenced `kubernetes.io/dockerconfigjson` Secret and uses the embedded credentials
when contacting the registry to pull the image. The Secret must exist in the same namespace as
the Pod.

**Security note:** The `kubernetes.io/dockerconfigjson` Secret type stores a base64-encoded
JSON object containing your registry server, username, and password. Like all Secrets, the
data is base64-encoded for binary safety — not encrypted. Apply RBAC to restrict which
service accounts and workloads can access it.
