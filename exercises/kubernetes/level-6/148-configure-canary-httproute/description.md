# Configure a Canary HTTPRoute

You are rolling out a new version of a web application. The stable version is already running and receiving all traffic. Your task is to wire up a canary deployment so that 10% of requests are served by the new version while 90% stay on stable.

## Background

Gateway API models traffic splitting through `weight` fields on `backendRefs` inside an HTTPRoute rule. Weights are **relative integers**, not percentages. If one backend has weight 90 and another has weight 10, Traefik distributes roughly 90% of requests to the first and 10% to the second.

This differs from the Level 5 selector-based canary approach, where traffic splitting was implicit (a 4:1 replica ratio meant roughly 80/20). With Gateway API weights you control the split **explicitly**, independent of replica counts.

## What is already running

The namespace `fl-k8s-0148` contains:

| Resource                | Description                                         |
| ----------------------- | --------------------------------------------------- |
| Deployment `web-stable` | Stable version, 2 replicas, nginx 1.27              |
| Deployment `web-canary` | Canary version, 2 replicas, nginx 1.27              |
| Service `web-stable`    | Port 80, selects `version=stable` pods              |
| Service `web-canary`    | Port 80, selects `version=canary` pods              |
| Gateway `app-gw`        | HTTP listener on port 80 for `app.k8s-0148.fl.test` |
| HTTPRoute `app-route`   | Currently sends **100% of traffic to `web-stable`** |

## Your task

Modify HTTPRoute `app-route` so that:

- `web-stable` receives **90%** of traffic (weight 90)
- `web-canary` receives **10%** of traffic (weight 10)

Both backends must be listed in the same rule's `backendRefs`.

## How to edit the HTTPRoute

```bash
kubectl edit httproute app-route -n fl-k8s-0148
```

Find the `rules` section. It currently looks like:

```yaml
rules:
  - backendRefs:
      - name: web-stable
        port: 80
        weight: 100
```

Change it to:

```yaml
rules:
  - backendRefs:
      - name: web-stable
        port: 80
        weight: 90
      - name: web-canary
        port: 80
        weight: 10
```

## Verifying your change

Check the HTTPRoute is still accepted after your edit:

```bash
kubectl describe httproute app-route -n fl-k8s-0148
```

Look for `Accepted: True` and `ResolvedRefs: True` in the status conditions. If `ResolvedRefs` is False, one of your backend Service names is likely misspelled.
