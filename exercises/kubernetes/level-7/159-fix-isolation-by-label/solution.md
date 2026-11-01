# Solution

Inspect the existing NetworkPolicy to confirm the required label:

```bash
kubectl describe networkpolicy allow-frontend -n fl-k8s-0159
```

The `From` section shows `PodSelector: role=frontend`.

Add the missing label to `isolated-client`:

```bash
kubectl label pod isolated-client role=frontend -n fl-k8s-0159
```

Verify the label was applied:

```bash
kubectl get pod isolated-client -n fl-k8s-0159 --show-labels
```

Test that `isolated-client` can now reach `api`:

```bash
kubectl exec isolated-client -n fl-k8s-0159 -- \
  wget -qO- -T5 http://api.fl-k8s-0159:80/
```

Expected: nginx welcome page.

Confirm `deny-client` remains blocked:

```bash
kubectl exec deny-client -n fl-k8s-0159 -- \
  curl -s --max-time 8 http://api.fl-k8s-0159/
```

Expected: exit 28 (TCP timeout — `deny-client` still lacks `role=frontend`).

**Key points:**

- `kubectl label pod <name> <key>=<value> -n <namespace>` adds or updates a
  label on a running Pod without restarting it.
- The CNI (kindnet) watches Pod labels and updates firewall rules immediately —
  no policy reapply is needed.
- No NetworkPolicy was edited. Only the Pod's label changed. This is the canonical
  way to move a Pod in or out of a NetworkPolicy's scope.
- To overwrite an existing label, pass `--overwrite`: `kubectl label pod ...
role=frontend -n ... --overwrite`.
