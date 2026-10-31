A Job runs a task once. A CronJob runs a Job on a repeating schedule — the same cron syntax used by Unix cron, expressed as a five-field string: `minute hour day-of-month month day-of-week`.

`*/5 * * * *` means "every 5 minutes". `0 2 * * *` means "at 2:00 AM every day". Each field accepts numbers, ranges, step values (`*/5`), and wildcards (`*`).

A CronJob wraps a Job template. The Job template in turn wraps a Pod template. This nesting means a CronJob has two restartPolicy locations to think about: the Pod's `restartPolicy` (inside `spec.jobTemplate.spec.template.spec`) and the CronJob's scheduling fields. For batch workloads, always set the Pod's `restartPolicy` to `Never` or `OnFailure` — not `Always`, which is for long-running services.

Create a CronJob named `report` in `fl-k8s-0070` that:

- Runs on a schedule of `*/5 * * * *`
- Uses image `busybox:1.36`
- Executes `sh -c 'echo report-$(date +%s)'`
- Sets Pod `restartPolicy: Never`
