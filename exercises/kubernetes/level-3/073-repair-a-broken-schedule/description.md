A CronJob named `metrics` in `fl-k8s-0073` was suspended during a maintenance window. The maintenance is done, but before it can be re-enabled, the schedule also needs an update: the daily midnight run (`0 0 * * *`) should be replaced with a more frequent every-10-minutes schedule (`*/10 * * * *`) to match a new SLA requirement.

Two changes are needed:

1. Update the `schedule` field to `*/10 * * * *`
2. Set `suspend: false` to re-enable scheduling

These can be applied in a single patch. Making both changes atomically is safer than two separate operations, since an unsuspended job with an unintended schedule could fire immediately.
