The `fl-k8s-0064` namespace has a Deployment named `backend`. Its native sidecar container `monitor` (busybox:1.36) has a broken command that exits immediately, keeping the Pod in `CrashLoopBackOff`.

Inspect the Deployment to find the bad command, fix it so `monitor` runs continuously, and wait for the Deployment to roll out.

Requirements:

- Keep `monitor` as a native sidecar in `initContainers[]` with `restartPolicy: Always`
- Do not change the image (`busybox:1.36`)
- Fix the command so it runs indefinitely (e.g. `sh -c 'while true; do sleep 30; done'`)
- Deployment `backend` must roll out with 1 replica ready
