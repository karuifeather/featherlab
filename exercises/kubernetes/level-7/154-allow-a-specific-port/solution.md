# Solution

A `default-deny` policy is already in place. Create `allow-port-80` to allow TCP port 80
ingress from any Pod:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-port-80
  namespace: fl-k8s-0154
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes:
    - Ingress
  ingress:
    - ports:
        - protocol: TCP
          port: 80
```

Apply it:

```bash
kubectl apply -f port80.yaml
```

Verify that `grader-client` can reach port 80:

```bash
kubectl exec grader-client -n fl-k8s-0154 -- wget -qO- http://api:80/
```

Expected: nginx welcome page.

Inspect the resulting policy:

```bash
kubectl describe networkpolicy allow-port-80 -n fl-k8s-0154
```

**Key points:**

- A rule with `ports` but no `from` allows connections from any source Pod or namespace on
  those ports. This is useful when you want to expose a Service broadly but still restrict
  other ports on the same Pod.
- The `port` field in NetworkPolicy refers to the **target container port** (the port the
  process actually listens on), not the Service port. Since nginx listens on 80 and the
  Service also maps 80→80, they align here.
- The existing `default-deny` policy remains active. Only connections to port 80 are now
  permitted; all other ports are still blocked.
