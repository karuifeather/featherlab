# Solution

## 1. Confirm the broken release

```bash
kubectl get pods -n fl-k8s-0119 -l version=green
```

Green Pods show `ImagePullBackOff` — the image `nginx:1.27.99` does not exist.

## 2. Switch traffic back to blue

```bash
kubectl patch svc web -n fl-k8s-0119 \
  --type=merge \
  -p='{"spec":{"selector":{"app":"web","version":"blue"}}}'
```

## 3. Verify recovery

```bash
kubectl get endpoints web -n fl-k8s-0119
kubectl get pods -n fl-k8s-0119 -o wide -l version=blue
```

Endpoints should list the two blue Pod IPs. Test HTTP:

```bash
kubectl exec grader-client -n fl-k8s-0119 -- wget -qO- http://web.fl-k8s-0119:80/
```

## 4. Confirm green is preserved

```bash
kubectl get deployment web-green -n fl-k8s-0119
```

The broken Deployment remains for post-incident investigation.
