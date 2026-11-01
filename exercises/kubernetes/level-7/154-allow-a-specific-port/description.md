# Allow Traffic on a Specific Port

## Port restrictions in NetworkPolicy

So far you have restricted traffic by _who_ can connect (`from` selectors). NetworkPolicy can
also restrict traffic by _which port_ a connection targets. This is useful when a workload
listens on multiple ports — you can expose only the ports that external Pods should reach.

A port restriction in an ingress rule looks like this:

```yaml
ingress:
  - ports:
      - protocol: TCP
        port: 80
```

When `ports` is set, only connections to those ports are permitted. When `from` is omitted
(or set to an empty list), the rule allows **any Pod** — but only on the listed ports.

## Combining from and ports

`from` and `ports` are independent dimensions in a single ingress rule. Within one rule:

- Both conditions must be satisfied for traffic to be allowed (logical AND).

Across multiple rules, any rule that matches allows the traffic (logical OR).

```yaml
ingress:
  - from: # any Pod with role=frontend…
      - podSelector:
          matchLabels:
            role: frontend
    ports: # …but only on port 80
      - protocol: TCP
        port: 80
```

## The task

A `default-deny` policy is already installed in namespace `fl-k8s-0154`. The `api` nginx Pod
listens on port 80. Create a NetworkPolicy named `allow-port-80` that allows ingress to the
`api` Pod on TCP port 80 from **any** Pod in the namespace.

**1. Write the manifest** (`port80.yaml`):

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

**2. Apply it:**

```bash
kubectl apply -f port80.yaml
```

**3. Verify the grader-client can now reach port 80:**

```bash
kubectl exec grader-client -n fl-k8s-0154 -- wget -qO- http://api:80/
```

Expected: nginx welcome page.

**4. Inspect the policy:**

```bash
kubectl describe networkpolicy allow-port-80 -n fl-k8s-0154
```

Look for `Allowing ingress traffic: To Port: 80/TCP` and `From: <any> (traffic not restricted by source)`.

## What happens on other ports?

Even with `allow-port-80`, any attempt to connect to the `api` Pod on a port other than 80
is still blocked by `default-deny`. Port-scoped rules are a way to expose exactly the
interface a Service offers without opening any administrative or debug port accidentally.

## Reference

- [NetworkPolicy spec ports](https://kubernetes.io/docs/concepts/services-networking/network-policies/#behavior-of-to-and-from-selectors)
