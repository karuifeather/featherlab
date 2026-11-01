# Solution

The Service has `targetPort: 9090` but nginx listens on port 80. Edit the Service to fix it:

```bash
kubectl edit svc api -n fl-k8s-0115
```

Change:

```yaml
targetPort: 9090
```

To:

```yaml
targetPort: 80
```

Save and exit.

Verify endpoints are now listed:

```bash
kubectl describe svc api -n fl-k8s-0115
```

The `Endpoints` field should show `<pod-ip>:80` entries.

Test connectivity:

```bash
kubectl exec grader-client -n fl-k8s-0115 -- wget -qO- http://api.fl-k8s-0115:8080/
```

**Declarative patch alternative:**

```bash
kubectl patch svc api -n fl-k8s-0115 \
  --type=json \
  -p='[{"op":"replace","path":"/spec/ports/0/targetPort","value":80}]'
```
