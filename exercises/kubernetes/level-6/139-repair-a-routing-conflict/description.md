# Repair a Routing Conflict

## The problem

Namespace `fl-k8s-0139` has two HTTPRoutes attached to the same Gateway and hostname:

- `app-route` — matches PathPrefix `/` → Service `app:80` (returns `main-app`)
- `admin-route` — matches PathPrefix `/` → Service `admin:80` (returns `admin-panel`)

Both routes claim ownership of every path on `app.k8s-0139.fl.test`. The Gateway API
specification says conflicting routes with identical specificity are resolved by
creation timestamp (older wins), but behavior in practice is implementation-defined and
unpredictable. Neither path reliably reaches the intended backend.

## How path specificity works

The Gateway API resolves conflicts by **specificity**: a longer, more specific path prefix
takes priority over a shorter one.

| Rule A               | Rule B            | Winner   |
| -------------------- | ----------------- | -------- |
| `PathPrefix /admin`  | `PathPrefix /`    | Rule A   |
| `PathPrefix /api/v1` | `PathPrefix /api` | Rule A   |
| `PathPrefix /`       | `PathPrefix /`    | Conflict |

By changing `admin-route` to match `PathPrefix /admin`, there is no longer a conflict:
requests to `/admin` (and any sub-path like `/admin/settings`) go to `admin`, while
everything else falls through to `app-route`'s catch-all `/`.

## Your task

Fix HTTPRoute `admin-route` in namespace `fl-k8s-0139` so that it matches `PathPrefix /admin`
instead of `PathPrefix /`:

```bash
kubectl edit httproute admin-route -n fl-k8s-0139
```

After the fix:

- `GET /` → `main-app`
- `GET /admin` → `admin-panel`

## Reference

- [HTTPRoute conflict resolution (Gateway API docs)](https://gateway-api.sigs.k8s.io/concepts/guidelines/#conflicts)
