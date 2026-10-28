The `api` Deployment in `fl-k8s-0053` was recently deployed but never became available. The Pods
are Running — the container started and is not crashing — yet `availableReplicas` stays at zero.
Something is stopping the Pod from being marked Ready.

A misconfigured readiness probe is one of the most common causes of this pattern. The probe can
target a port that no process is listening on, use the wrong HTTP path, or have timings so tight
that even a healthy container cannot respond in time. None of these cause the container to exit,
so the Pod stays `Running` but never passes the readiness gate.

Investigate the Deployment's probe configuration, identify the mistake, and fix it so the
Deployment rolls out successfully with one available replica.
