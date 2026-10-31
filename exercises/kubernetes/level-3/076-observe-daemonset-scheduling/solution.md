Inspect the DaemonSet:

```bash
kubectl get daemonset cluster-agent -n fl-k8s-0076
# NAME            DESIRED   CURRENT   READY   UP-TO-DATE   AVAILABLE
# cluster-agent   1         1         1       1            1

kubectl describe daemonset cluster-agent -n fl-k8s-0076
# Shows: Selector, Node-Selector, Pod Template, and Events
```

In the kind single-node cluster, `DESIRED=1` is the correct result — one eligible node means one Pod.

Add the `observed: yes` label:

```bash
kubectl label daemonset cluster-agent observed=yes -n fl-k8s-0076
```

Verify:

```bash
kubectl get daemonset cluster-agent -n fl-k8s-0076 --show-labels
# NAME            ...   LABELS
# cluster-agent   ...   observed=yes
```
