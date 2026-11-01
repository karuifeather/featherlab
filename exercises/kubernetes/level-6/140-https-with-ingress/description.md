# HTTPS with Ingress

## TLS termination at the Ingress

When an Ingress controller terminates TLS, it decrypts HTTPS traffic from clients and forwards
plain HTTP to the backend Service. The certificate and private key are stored in a
`kubernetes.io/tls` Secret:

```
Client ---(HTTPS/TLS)---> Ingress controller ---(HTTP)---> Service ---> Pod
```

The Ingress resource references the Secret by name in its `spec.tls` section.

## The setup

Namespace `fl-k8s-0140` already has:

- A `web` Deployment and Service
- A `kubernetes.io/tls` Secret named `app-tls` containing a valid certificate and key
- An Ingress `web` with an HTTP rule for `app.k8s-0140.fl.test` — but **no TLS stanza**

```bash
kubectl get ingress web -n fl-k8s-0140 -o yaml
kubectl get secret app-tls -n fl-k8s-0140
```

## How the Ingress TLS stanza works

```yaml
spec:
  tls:
    - hosts:
        - app.k8s-0140.fl.test
      secretName: app-tls
  rules:
    - host: app.k8s-0140.fl.test
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web
                port:
                  number: 80
```

The `spec.tls` block tells the controller which certificate to use for each hostname. The
`spec.rules` block stays unchanged — HTTPS traffic is routed to the same backend.

## What is in a kubernetes.io/tls Secret?

A `kubernetes.io/tls` Secret must contain exactly two keys:

| Key       | Content                       |
| --------- | ----------------------------- |
| `tls.crt` | PEM-encoded certificate chain |
| `tls.key` | PEM-encoded private key       |

## Your task

Edit Ingress `web` in namespace `fl-k8s-0140` and add the TLS stanza to enable HTTPS:

```bash
kubectl edit ingress web -n fl-k8s-0140
```

## Reference

- [Ingress TLS (Kubernetes docs)](https://kubernetes.io/docs/concepts/services-networking/ingress/#tls)
