# Broken Policy Diagnostics

## The scenario

Namespace `fl-k8s-0164` has two NetworkPolicies:

- `deny-all` — blocks all ingress to all pods
- `allow-admin` — intended to allow pods with `role: admin` to reach the API server

`grader-client` has `role: admin` and should be able to reach `api`, but it's
unexpectedly blocked. Something is wrong with `allow-admin`.

## Investigate

Inspect the broken policy:

```bash
kubectl get networkpolicy allow-admin -n fl-k8s-0164 -o yaml
```

Check the actual labels on `grader-client`:

```bash
kubectl get pod grader-client -n fl-k8s-0164 --show-labels
```

Compare the `role` value in the policy's `podSelector.matchLabels` to the label
on `grader-client`. NetworkPolicy matching is exact — a single typo means the
selector never matches.

You can also use `describe` for a human-readable view:

```bash
kubectl describe networkpolicy allow-admin -n fl-k8s-0164
```

## What you will find

The `allow-admin` policy has `matchLabels: {role: adminn}` (double `n`). The pod has
`role: admin` (single `n`). The selector never matches, so the allow rule is
effectively dead.

## Your task

Fix the `allow-admin` NetworkPolicy so `grader-client` (role: admin) can reach `api`:

```bash
kubectl edit networkpolicy allow-admin -n fl-k8s-0164
# Change  role: adminn  →  role: admin
```

Or apply the corrected version:

```bash
kubectl apply -n fl-k8s-0164 -f - <<'EOF'
# your corrected policy here
EOF
```

`deny-client` (no `role` label) must remain blocked.
