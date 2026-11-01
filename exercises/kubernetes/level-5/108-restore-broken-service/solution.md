# Solution

The Service has `targetPort: 9090` but nginx listens on port `80`. Fix it:

```bash
kubectl edit svc inventory -n fl-k8s-0108
```

Change:

```yaml
ports:
  - port: 9090
    targetPort: 9090 # ← wrong
```

To:

```yaml
ports:
  - port: 9090
    targetPort: 80 # ← correct
```

Endpoints appear immediately (the selector was already correct):

```bash
kubectl get endpoints inventory -n fl-k8s-0108
# inventory   10.x.x.x:80,10.x.x.x:80
```

Test HTTP through port 9090:

```bash
kubectl run client --restart=Never --image=busybox:1.36 -n fl-k8s-0108 \
  --rm -it -- wget -qO- http://inventory.fl-k8s-0108:9090/
# Returns nginx welcome page HTML
```
