# Solution: Broken Policy Diagnostics

## Diagnose the problem

First, inspect the `allow-admin` NetworkPolicy to find the typo:

```bash
kubectl get networkpolicy allow-admin -n fl-k8s-0164 -o yaml
```

Look for the `ingress[].from[].podSelector.matchLabels` field. You will see:

```yaml
podSelector:
  matchLabels:
    role: adminn # <-- typo: double "n"
```

Compare that with the actual label on `grader-client`:

```bash
kubectl get pod grader-client -n fl-k8s-0164 --show-labels
# NAME             READY   STATUS    LABELS
# grader-client    1/1     Running   app=grader-client,role=admin,...
```

The pod has `role=admin` but the policy selects `role=adminn` — so the ingress rule never matches.

## Fix the policy

Apply the corrected NetworkPolicy:

```bash
kubectl apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-admin
  namespace: fl-k8s-0164
spec:
  podSelector: {}
  policyTypes:
    - Ingress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              role: admin
EOF
```

## Verify

```bash
# grader-client (role=admin) can now reach api
kubectl exec grader-client -n fl-k8s-0164 -- wget -qO- http://api.fl-k8s-0164.svc.cluster.local/
# Should return nginx HTML

# deny-client (no role=admin label) is still blocked
kubectl exec deny-client -n fl-k8s-0164 -- \
  curl -s --max-time 5 http://api.fl-k8s-0164.svc.cluster.local/
# Should time out (exit 28) or be refused
```

## Key lesson

NetworkPolicy selects Pods **purely by labels** at the time the connection is attempted. A one-character typo in a label selector silently breaks access — the policy is syntactically valid and Kubernetes accepts it without complaint. Always verify policies by checking both the selector labels in the policy and the actual labels on the pods:

```bash
kubectl get pods -n fl-k8s-0164 --show-labels
kubectl describe networkpolicy allow-admin -n fl-k8s-0164
```
