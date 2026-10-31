Create a Job that runs multiple Pods in parallel to reach a target completion count.

Create a Job named `worker` in namespace `fl-k8s-0068`:

- Container image: `busybox:1.36`
- Command: `sh -c 'echo worker-done'`
- `completions: 4` (4 successful Pods required)
- `parallelism: 2` (run 2 Pods at a time)
- Pod restartPolicy: `Never`
- Job must complete all 4 completions
