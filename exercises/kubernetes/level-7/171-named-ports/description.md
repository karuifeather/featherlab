# Named Ports in NetworkPolicy

## Named container ports

Kubernetes lets you assign a name to a container's port declaration:

```yaml
containers:
  - name: nginx
    image: nginx:1.27
    ports:
      - name: http # symbolic name
        containerPort: 80
```

And a Service can reference that port by name in its `targetPort`:

```yaml
spec:
  ports:
    - name: http
      port: 80
      targetPort: http # resolves to containerPort 80 on the selected Pod
```

## Named ports in NetworkPolicy

A NetworkPolicy's port rule can also reference a named port instead of a number:

```yaml
ports:
  - port: http # resolves against the target Pod's containerPort names
```

This is functionally equivalent to `port: 80` when the api pod declares
`name: http, containerPort: 80`. The advantage is that the policy stays correct
even if the port number changes — as long as the name `http` keeps mapping to
the same listening port.

**Important:** named port resolution happens against the **target Pod's** containerPort
list, not the Service's port list. If the Pod does not declare a port with that name,
the rule has no effect.

## What numeric port references check

A numeric `port: 80` in a NetworkPolicy matches TCP (or the specified protocol) on
port 80 regardless of what name the Pod gives that port. Both numeric and named port
references are valid and interchangeable when the names map 1:1 to numbers.

## The starting state

In namespace `fl-k8s-0171`:

- Pod `api` (nginx:1.27, label `app=api`) with a named containerPort `http` on 80.
- Service `api` with a named port `http` → `targetPort: http`.
- Pod `grader-client` (busybox:1.36, label `app=grader-client`).
- Pod `deny-client` (curlimages/curl:8.10.1, label `app=deny-client`).
- NetworkPolicy `deny-all` blocks all ingress to `app=api`.

## The task

Create NetworkPolicy `allow-http-port` in namespace `fl-k8s-0171` that:

1. Selects `app=api` pods.
2. Allows ingress **only from `app=grader-client`** pods.
3. Restricts to **port `http`** (named port, resolves to 80).

**1. Write the manifest:**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-http-port
  namespace: fl-k8s-0171
spec:
  podSelector:
    matchLabels:
      app: api
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: grader-client
      ports:
        - port: http
```

**2. Apply and verify:**

```bash
kubectl apply -f allow-http-port.yaml
kubectl describe networkpolicy allow-http-port -n fl-k8s-0171
```

**3. Test (optional):**

```bash
# grader-client should succeed
kubectl exec grader-client -n fl-k8s-0171 -- \
  wget -qO- -T5 http://api.fl-k8s-0171.svc.cluster.local:80/

# deny-client should time out
kubectl exec deny-client -n fl-k8s-0171 -- \
  curl -s --max-time 5 http://api.fl-k8s-0171.svc.cluster.local:80/
```

## Reference

- [NetworkPolicy port selectors](https://kubernetes.io/docs/concepts/services-networking/network-policies/#behavior-of-to-and-from-selectors)
- [Named ports](https://kubernetes.io/docs/concepts/services-networking/service/#field-spec-ports)
