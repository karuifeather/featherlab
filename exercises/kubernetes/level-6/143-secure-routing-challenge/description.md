# Secure Routing Challenge

## The situation

Namespace `fl-k8s-0143` has a `secure-gw` Gateway and an `app-route` HTTPRoute. The HTTPRoute
is pre-configured to attach specifically to the Gateway's HTTPS listener — but that listener
does not exist yet:

```bash
kubectl get httproute app-route -n fl-k8s-0143 -o yaml
```

Look at `spec.parentRefs[0].sectionName`. It is set to `https`, which is the name of the
listener the route wants to attach to. Check the Gateway — it currently has only an `http`
listener on port 80:

```bash
kubectl get gateway secure-gw -n fl-k8s-0143 -o yaml
```

The HTTPRoute status shows `NoMatchingParent` because no listener named `https` exists.

## Why sectionName matters

A `parentRef` with `sectionName` binds the HTTPRoute to a **specific listener** by name.
This is useful when a Gateway has multiple listeners on different ports or protocols and you
want the route to be reachable only on one of them:

```yaml
spec:
  parentRefs:
    - name: secure-gw
      sectionName: https # only attaches to the listener named "https"
```

If the named listener does not exist, the route has no parent and carries
`Accepted: False` with reason `NoMatchingParent`.

## Your task

Edit Gateway `secure-gw` in namespace `fl-k8s-0143` and add an HTTPS listener named `https`
on port 443 that terminates TLS using Secret `app-tls`:

```bash
kubectl edit gateway secure-gw -n fl-k8s-0143
```

The listener **must** be named `https` to match the HTTPRoute's `sectionName`. After the fix:

- The Gateway becomes Programmed with both listeners
- The HTTPRoute's `NoMatchingParent` condition resolves to `Accepted: True`
- HTTPS requests to `app.k8s-0143.fl.test` reach the `app` backend

## Reference

- [HTTPRoute parentRef sectionName](https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.ParentReference)
- [Gateway TLS termination](https://gateway-api.sigs.k8s.io/concepts/tls/)
