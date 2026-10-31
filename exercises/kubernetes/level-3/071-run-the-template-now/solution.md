Create the Job from the CronJob's template:

```bash
kubectl create job manual-report --from=cronjob/reporter -n fl-k8s-0071
```

Wait for it to finish:

```bash
kubectl wait --for=condition=complete job/manual-report -n fl-k8s-0071 --timeout=120s
```

Check the result:

```bash
kubectl get job manual-report -n fl-k8s-0071
# NAME            COMPLETIONS   DURATION   AGE
# manual-report   1/1           5s         30s

kubectl logs -l job-name=manual-report -n fl-k8s-0071
# report generated
```

The `COMPLETIONS: 1/1` column confirms the Job succeeded. The log shows the command output from the CronJob's container template.
