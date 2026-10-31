Add the label to the DaemonSet metadata:

```bash
kubectl label daemonset log-forwarder tier=monitoring -n fl-k8s-0075
```

Verify the label was applied:

```bash
kubectl get daemonset log-forwarder -n fl-k8s-0075 --show-labels
# NAME            ...   LABELS
# log-forwarder   ...   tier=monitoring
```

Check DaemonSet status:

```bash
kubectl get daemonset log-forwarder -n fl-k8s-0075
# NAME            DESIRED   CURRENT   READY   UP-TO-DATE   AVAILABLE
# log-forwarder   1         1         1       1            1
```

Adding a label to the DaemonSet metadata does not change the Pod template, so no rolling update is triggered. The Pods remain running unchanged.
