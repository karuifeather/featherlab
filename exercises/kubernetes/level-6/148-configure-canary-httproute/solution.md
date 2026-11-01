# Solution: Configure a Canary HTTPRoute

## What needs to change

The HTTPRoute `app-route` starts with a single `backendRef` pointing 100% to `web-stable`. You need to add `web-canary` as a second backend and set the relative weights to 90 and 10.

## Option 1 — kubectl edit

```bash
kubectl edit httproute app-route -n fl-k8s-0148
```

Update the `rules` section:

```yaml
spec:
  parentRefs:
    - name: app-gw
  hostnames:
    - app.k8s-0148.fl.test
  rules:
    - backendRefs:
        - name: web-stable
          port: 80
          weight: 90
        - name: web-canary
          port: 80
          weight: 10
```

## Option 2 — kubectl patch

```bash
kubectl patch httproute app-route -n fl-k8s-0148 --type=merge -p '
spec:
  rules:
    - backendRefs:
        - name: web-stable
          port: 80
          weight: 90
        - name: web-canary
          port: 80
          weight: 10
'
```

## Option 3 — apply a patch file

Create `patch.yaml`:

```yaml
spec:
  rules:
    - backendRefs:
        - name: web-stable
          port: 80
          weight: 90
        - name: web-canary
          port: 80
          weight: 10
```

Apply:

```bash
kubectl patch httproute app-route -n fl-k8s-0148 --type=merge --patch-file=patch.yaml
```

## Verify

```bash
kubectl describe httproute app-route -n fl-k8s-0148
```

Both `Accepted: True` and `ResolvedRefs: True` should appear in the status conditions. `ResolvedRefs: True` confirms Traefik successfully resolved both `web-stable` and `web-canary` Services.

## Key insight

Weights in `backendRefs` are relative — weight 90 and weight 10 means roughly 90/10 percent. You could also use 9 and 1, or 900 and 100. What matters is the ratio, not the absolute values. Keeping them easy to read (weights that sum to 100) is a common convention but not required by the API.
