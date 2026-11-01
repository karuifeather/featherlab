# Solution

Create the `allow-http-port` NetworkPolicy using the named port `http`:

```bash
kubectl apply -f - <<'EOF'
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
EOF
```

You can also use the equivalent numeric form `port: 80` — both are accepted:

```yaml
ports:
  - protocol: TCP
    port: 80
```

Verify:

```bash
kubectl get networkpolicy -n fl-k8s-0171
kubectl describe networkpolicy allow-http-port -n fl-k8s-0171
```

Test `grader-client` can reach `api`:

```bash
kubectl exec grader-client -n fl-k8s-0171 -- \
  wget -qO- -T5 http://api.fl-k8s-0171.svc.cluster.local:80/
```

Expected: nginx HTML response.

Test `deny-client` is still blocked:

```bash
kubectl exec deny-client -n fl-k8s-0171 -- \
  curl -s --max-time 5 http://api.fl-k8s-0171.svc.cluster.local:80/
echo "exit: $?"
```

Expected: exit code 28 (timeout — ingress block).

## Why `port: http` works

The api Pod declares `containerPort: 80` with `name: http`. When the CNI enforces
the NetworkPolicy, it resolves the named port `http` against the target Pod's
containerPort list and finds port 80. The rule then allows TCP port 80 ingress from
`app=grader-client` pods — equivalent to `port: 80`.

The `deny-client` pod (label `app=deny-client`) does not match `app=grader-client`
in the `from` selector, so it remains blocked by the `deny-all` policy.
