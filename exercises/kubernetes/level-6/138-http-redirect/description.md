# HTTP Redirect

## Background

URLs change over time. When a page moves, users and search engines that bookmarked the old URL
should be automatically sent to the new one. An HTTP 301 redirect tells clients that the
resource has permanently moved, and the `Location` header tells them where to go.

## The setup

Namespace `fl-k8s-0138` has a `web` backend serving the current site at path `/current`.
HTTPRoute `web-route` already has a rule for `/current`. Your task is to add a redirect rule
so requests to `/old` receive a 301 response pointing to `/current`.

```bash
kubectl get httproute web-route -n fl-k8s-0138 -o yaml
```

## How HTTPRoute redirect filters work

Instead of a `backendRefs` entry, a redirect rule uses a `filters` entry:

```yaml
rules:
  - matches:
      - path:
          type: PathPrefix
          value: /old
    filters:
      - type: RequestRedirect
        requestRedirect:
          path:
            type: ReplaceFullPath
            value: /current
          statusCode: 301
```

`ReplaceFullPath` replaces the entire path in the Location header. The `scheme` and `hostname`
fields are omitted here, so the redirect preserves them from the original request.

## Your task

Edit HTTPRoute `web-route` in namespace `fl-k8s-0138` and add a redirect rule so that:

- Requests to `/old` receive HTTP 301 with `Location` containing `/current`
- Requests to `/current` continue to reach the `web` backend

```bash
kubectl edit httproute web-route -n fl-k8s-0138
```

## Reference

- [HTTPRoute filters — RequestRedirect](https://gateway-api.sigs.k8s.io/reference/spec/#gateway.networking.k8s.io/v1.HTTPRequestRedirectFilter)
