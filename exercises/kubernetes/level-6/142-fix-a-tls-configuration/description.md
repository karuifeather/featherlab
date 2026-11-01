# Fix a TLS Configuration

## The problem

Namespace `fl-k8s-0142` has an Ingress `web` that is supposed to serve HTTPS. Its TLS stanza
references a Secret that does not exist:

```bash
kubectl get ingress web -n fl-k8s-0142 -o jsonpath='{.spec.tls}'
# [{"hosts":["app.k8s-0142.fl.test"],"secretName":"wrong-tls-secret"}]
```

When the Secret referenced by an Ingress TLS stanza does not exist, the Ingress controller
falls back to its default certificate (if any) or returns an error. Either way, the intended
certificate is not served.

## Finding the correct Secret

List the Secrets in the namespace to find the one that holds the correct certificate:

```bash
kubectl get secret -n fl-k8s-0142
```

Look for a Secret of type `kubernetes.io/tls`.

Inspect it to confirm it holds a valid TLS certificate:

```bash
kubectl get secret correct-tls -n fl-k8s-0142 -o jsonpath='{.data.tls\.crt}' \
  | base64 -d \
  | openssl x509 -noout -subject -dates
```

## Your task

Edit Ingress `web` in namespace `fl-k8s-0142` and change the `secretName` to reference the
correct TLS Secret:

```bash
kubectl edit ingress web -n fl-k8s-0142
```

After the fix, the HTTPS routing probe should reach the `web` backend.

## Reference

- [Ingress TLS (Kubernetes docs)](https://kubernetes.io/docs/concepts/services-networking/ingress/#tls)
- [kubernetes.io/tls Secrets](https://kubernetes.io/docs/concepts/configuration/secret/#tls-secrets)
