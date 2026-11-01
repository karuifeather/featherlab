# HTTPS with Gateway

## Gateway API TLS termination

In the Gateway API, each listener in a Gateway can independently handle HTTP or HTTPS. Adding
an HTTPS listener tells the controller to accept TLS connections on port 443 and decrypt them
before forwarding traffic to the backend:

```
Client ---(HTTPS/TLS)--> Gateway (port 443) ---(HTTP)---> Service ---> Pod
```

The TLS certificate is supplied by a `kubernetes.io/tls` Secret. The Gateway listener
references the Secret through `spec.listeners[].tls.certificateRefs`.

## The setup

Namespace `fl-k8s-0141` has:

- A `web` Deployment and Service
- A `kubernetes.io/tls` Secret named `app-tls` with a valid certificate and key
- Gateway `web-gw` with only an HTTP listener on port 80
- HTTPRoute `web-route` that routes all traffic to `web:80`

```bash
kubectl get gateway web-gw -n fl-k8s-0141 -o yaml
kubectl get secret app-tls -n fl-k8s-0141
```

## How to add an HTTPS listener

```yaml
spec:
  listeners:
    - name: http
      port: 80
      protocol: HTTP
      hostname: "app.k8s-0141.fl.test"
    - name: https
      port: 443
      protocol: HTTPS
      hostname: "app.k8s-0141.fl.test"
      tls:
        mode: Terminate
        certificateRefs:
          - name: app-tls
            kind: Secret
```

`mode: Terminate` means the Gateway decrypts TLS and forwards plaintext to the backend.
(`mode: Passthrough` would forward the encrypted stream unchanged, but that requires a
TLSRoute, not an HTTPRoute.)

## HTTPRoute auto-attachment

The existing HTTPRoute `web-route` has a `parentRef` pointing at `web-gw` with no
`sectionName` restriction. A parentRef with no `sectionName` attaches to **all** compatible
listeners on the referenced Gateway. After you add the HTTPS listener, the route automatically
serves traffic on both port 80 and port 443 — no changes to the HTTPRoute are needed.

## Your task

Edit Gateway `web-gw` in namespace `fl-k8s-0141` and add an HTTPS listener on port 443
that terminates TLS using Secret `app-tls`:

```bash
kubectl edit gateway web-gw -n fl-k8s-0141
```

## Reference

- [Gateway TLS (Gateway API docs)](https://gateway-api.sigs.k8s.io/concepts/tls/)
