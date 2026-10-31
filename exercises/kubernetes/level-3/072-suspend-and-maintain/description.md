A CronJob named `cleanup` runs nightly in `fl-k8s-0072`. The ops team needs to perform maintenance on the resources it accesses, so new runs must not start while the work is in progress.

Setting `spec.suspend: true` on a CronJob tells Kubernetes to skip all scheduled triggers until the flag is cleared. Any Jobs already running are not interrupted — only future firings are suppressed. This is the standard approach for planned downtime, config migrations, and emergency holds.

While the CronJob is suspended, this is also a good moment to trim its history. `successfulJobsHistoryLimit` and `failedJobsHistoryLimit` control how many finished Jobs are retained. The current values are too high (10 and 5); reduce them to 3 and 1 to keep the namespace tidy.

Your task: patch the `cleanup` CronJob to:

1. Set `suspend: true`
2. Set `successfulJobsHistoryLimit: 3`
3. Set `failedJobsHistoryLimit: 1`
