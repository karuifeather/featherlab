Deployment `blocked-app` has been created in namespace `fl-k8s-0093`, but its pod is stuck **Pending**. It will never schedule.

The Deployment has a required node affinity rule that demands a node with label `disktype=ssd`. No node in this cluster has that label, so the scheduler cannot find a valid placement.

Diagnose the problem and fix it:

1. Inspect the pod to find the scheduling failure reason:

   ```bash
   kubectl describe pods -n fl-k8s-0093
   ```

   Look for the `FailedScheduling` event and the message `0/1 nodes are available`.

2. Fix the required nodeAffinity rule in Deployment `blocked-app` to use key `kubernetes.io/os`, operator `In`, values `[linux]` — a label that every node in this cluster has.

3. Confirm the Deployment rolls out with 1 available replica.
