# Solution

Read the HTTPRoute status to find the broken backend:

```bash
kubectl get httproute app-route -n fl-k8s-0135 -o yaml
```

The `status.parents[0].conditions` section shows (exact message wording varies by
controller version):

```yaml
conditions:
  - type: Accepted
    status: "True"
    reason: Accepted
  - type: ResolvedRefs
    status: "False"
    reason: BackendNotFound
```

The route is attached to the Gateway (`Accepted: True`) but `ResolvedRefs: False` with
reason `BackendNotFound` means the backend Service `missing-service` does not exist.

List Services to confirm the correct name:

```bash
kubectl get service -n fl-k8s-0135
# NAME   TYPE        CLUSTER-IP   ...
# app    ClusterIP   ...
```

Fix the HTTPRoute:

```bash
kubectl edit httproute app-route -n fl-k8s-0135
```

Change `spec.rules[0].backendRefs[0].name` from `missing-service` to `app`.

**Declarative equivalent:**

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: app-route
  namespace: fl-k8s-0135
spec:
  parentRefs:
    - name: app-gw
  hostnames:
    - "app.k8s-0135.fl.test"
  rules:
    - backendRefs:
        - name: app
          port: 80
```

```bash
kubectl apply -f app-route.yaml
```

## Verify

```bash
kubectl describe httproute app-route -n fl-k8s-0135
# Both Accepted and ResolvedRefs should show status: True

kubectl exec -n fl-k8s-0135 grader-client -- \
  curl -s -H "Host: app.k8s-0135.fl.test" \
  http://traefik.traefik-system.svc.cluster.local/
# Returns nginx welcome page
```
