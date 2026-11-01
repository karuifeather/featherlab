# Broken Release Recovery

## The scenario

A new release (`web-green`) was deployed and traffic was switched to it. The release uses
image `nginx:1.27.99` — which does not exist. All green Pods are in `ImagePullBackOff`.
Users are seeing errors.

Your cluster currently has:

- `web-blue` — healthy, 2 replicas, no traffic (Service routes to green)
- `web-green` — broken, 2 replicas, `ImagePullBackOff`

## Step 1: Confirm the problem

```bash
kubectl get pods -n fl-k8s-0119 -l version=green
```

Look for `ImagePullBackOff` or `ErrImagePull` in the STATUS column.

Get details:

```bash
kubectl describe pod <green-pod-name> -n fl-k8s-0119
```

The Events section shows: `Failed to pull image "nginx:1.27.99": not found`.

## Step 2: Restore traffic to blue

Switching the Service selector is the fastest recovery path — no redeployment needed:

```bash
kubectl patch svc web -n fl-k8s-0119 \
  --type=merge \
  -p='{"spec":{"selector":{"app":"web","version":"blue"}}}'
```

## Step 3: Preserve green for investigation

Do **not** delete `web-green`. The broken Deployment and its Pods contain valuable
forensic data: image tags, events, environment variables, and resource specs. Your
incident response team will need to examine it.

## The task

1. Switch Service `web` selector back to `version=blue`
2. Verify HTTP through the Service works again
3. Leave `web-green` in place

## Reference

- [Pods — debugging](https://kubernetes.io/docs/tasks/debug/debug-application/debug-pods/)
