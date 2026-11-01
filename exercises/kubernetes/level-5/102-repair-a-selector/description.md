# Repair a Selector

## How selectors work

A Service finds its Pods using a **label selector**. The selector must exactly match the labels on the Pods. Even a single character difference (a typo, wrong case, missing hyphen) means the selector matches nothing — and the Service has no endpoints.

When a Service has no endpoints, traffic to the Service results in a connection refused error.

## Diagnosing the problem

In namespace `fl-k8s-0102` a `frontend` Deployment is running but its Service has no endpoints:

```bash
kubectl get endpoints frontend -n fl-k8s-0102
# NAME       ENDPOINTS   AGE
# frontend   <none>      ...
```

Compare the Service selector to the Pod labels:

```bash
# Service selector
kubectl get svc frontend -n fl-k8s-0102 -o jsonpath='{.spec.selector}'

# Pod labels
kubectl get pods -n fl-k8s-0102 --show-labels
```

## The task

Find the typo in the Service selector and correct it so the Service routes to the `frontend` Deployment's Pods.

## Reference

- [Services — selector](https://kubernetes.io/docs/concepts/services-networking/service/#selector)
