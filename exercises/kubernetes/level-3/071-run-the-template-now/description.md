A CronJob named `reporter` is waiting in `fl-k8s-0071`. Its schedule fires at 3 AM — a long wait in a lab environment. You need to verify the Job template is correct right now, without waiting for the schedule to trigger.

Kubernetes provides `kubectl create job --from=cronjob/<name>` for exactly this purpose. It copies the CronJob's job template, assigns a name you provide, and submits it immediately. The resulting Job runs just like any other: you can watch it, stream its logs, and wait for completion.

This technique is essential in practice: operators use it to trigger backfills, test new Job templates before deploying them, and manually kick off scheduled maintenance tasks outside their normal window.

Your task:

1. Create a Job named `manual-report` from the `reporter` CronJob in `fl-k8s-0071`
2. Wait for the Job to complete
