Edit the Deployment and add a `readinessProbe` with the required timing settings to the `app`
container:

```bash
kubectl edit deployment slow-start -n fl-k8s-0052
```

Add under the `app` container spec:

```yaml
readinessProbe:
  httpGet:
    path: /
    port: 80
  initialDelaySeconds: 5
  periodSeconds: 15
  failureThreshold: 6
```

Or patch it in one command:

```bash
kubectl patch deployment slow-start -n fl-k8s-0052 --type=json \
  -p='[{"op":"add","path":"/spec/template/spec/containers/0/readinessProbe","value":{"httpGet":{"path":"/","port":80},"initialDelaySeconds":5,"periodSeconds":15,"failureThreshold":6}}]'
```

Then confirm the rollout:

```bash
kubectl rollout status deployment/slow-start -n fl-k8s-0052
```

Verify the timing values are set:

```bash
kubectl get deployment slow-start -n fl-k8s-0052 \
  -o jsonpath='{.spec.template.spec.containers[0].readinessProbe}'
```
